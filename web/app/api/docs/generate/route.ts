import { NextRequest } from "next/server";
import { stringify as yamlStringify } from "yaml";
import { sseError, sseFromText, runGeminiPromptWithConfig } from "@/lib/gemini-runtime";
import { readCoverLetterVoiceExcerpt } from "@/lib/resume-coach";
import {
  extractReportNumFromReportPath,
  getReportBodyForUser,
} from "@/lib/report-excerpt";
import { requireApiUser } from "@/lib/supabase/api";
import {
  buildHostedAtsHtmlPrompt,
  buildHostedCoverHtmlPrompt,
  buildHostedFullHtmlPrompt,
  extractHostedHtmlBlock,
  type HostedTailorContext,
} from "@/lib/hosted-tailor-html";
import type { Browser } from "puppeteer-core";
import { htmlToPdfWithBrowser, launchPdfBrowser } from "@/lib/pdf-from-html";
import { hostedHtmlToDocxBuffer } from "@/lib/docx-from-html";
import {
  slugTailoredSegment,
  uploadUserPdf,
  uploadUserTailoredDocx,
  uploadUserTailoredHtml,
} from "@/lib/tailored-docs-storage";

export const dynamic = "force-dynamic";

/** Vercel Pro+ can raise; Hobby still caps at 60s wall time. */
export const maxDuration = 120;

function sseSingleError(message: string): Response {
  return sseError(message, 200);
}

function defaultModel(extra?: string) {
  return (
    extra?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    "gpt-4.1-mini"
  );
}

async function runHtmlModel(prompt: string, model: string): Promise<string> {
  return runGeminiPromptWithConfig(prompt, model, {
    temperature: 0.25,
    maxOutputTokens: 12_288,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) {
    return sseError("Unauthorized", 401);
  }

  let body: {
    kind?: "cv" | "cl" | "both";
    applicationNum?: string;
    company?: string;
    role?: string;
    reportRel?: string;
    reportNum?: string;
    regenerate?: boolean;
    canonicalStatus?: string;
    model?: string;
  };

  try {
    body = await req.json();
  } catch {
    return sseError("Invalid JSON body", 400);
  }

  const applicationNum = (body.applicationNum ?? "").trim();
  const company = (body.company ?? "").trim();
  const role = (body.role ?? "").trim();
  const kind = body.kind;
  const model = defaultModel(body.model);

  if (!applicationNum || !company || !role || !kind) {
    return sseError(
      "applicationNum, company, role, and kind are required",
      400,
    );
  }

  const regenerate = Boolean(body.regenerate);
  const canonicalStatus = (body.canonicalStatus ?? "").trim();
  if (regenerate && canonicalStatus === "Applied") {
    return sseSingleError(
      "Regeneration is disabled once this row is marked Applied.",
    );
  }

  const { data: ownRow } = await auth.supabase
    .from("applications")
    .select("id")
    .eq("user_id", auth.user.id)
    .eq("num", applicationNum)
    .maybeSingle();

  if (!ownRow) {
    return sseError(`Application #${applicationNum} not found.`, 404);
  }

  const [{ data: resume }, { data: prof }] = await Promise.all([
    auth.supabase
      .from("resumes")
      .select("content_md")
      .eq("user_id", auth.user.id)
      .maybeSingle(),
    auth.supabase
      .from("profiles")
      .select("data")
      .eq("user_id", auth.user.id)
      .maybeSingle(),
  ]);

  const cvMarkdown = String(resume?.content_md ?? "").trim();
  if (!cvMarkdown) {
    return sseError(
      "Your résumé is empty. Add it under Profile (or CV) before generating tailored documents.",
      400,
    );
  }

  const profileYaml = yamlStringify((prof?.data ?? {}) as object, {
    lineWidth: 100,
  }).slice(0, 12_000);

  let reportNum = (body.reportNum ?? "").trim();
  if (!reportNum && body.reportRel) {
    reportNum = extractReportNumFromReportPath(body.reportRel) ?? "";
  }

  let reportExcerpt = "";
  if (reportNum) {
    const md = await getReportBodyForUser(
      auth.supabase,
      auth.user.id,
      reportNum,
    );
    if (md) reportExcerpt = md.slice(0, 14_000);
  }

  const coverLetterVoice = await readCoverLetterVoiceExcerpt();
  const ctx: HostedTailorContext = {
    company,
    role,
    cvMarkdown,
    profileYaml,
    reportExcerpt,
    coverLetterVoice,
  };

  const uid = auth.user.id;
  const stamp = `${new Date().toISOString().slice(0, 10)}-${Date.now()}`;
  const slug = slugTailoredSegment(`${company}-${role}`);
  const basePath = `${uid}/tailored/${applicationNum}-${slug}-${stamp}`;

  const log: string[] = [];

  const skipPdfEnv = ["1", "true", "yes"].includes(
    (process.env.APPLYPANDA_SKIP_PDF ?? "").trim().toLowerCase(),
  );
  const skipDocxEnv = ["1", "true", "yes"].includes(
    (process.env.APPLYPANDA_SKIP_DOCX ?? "").trim().toLowerCase(),
  );
  if (skipPdfEnv) {
    log.push(
      "ℹ️ APPLYPANDA_SKIP_PDF is set — skipping headless Chrome; saving printable HTML only.",
    );
  }
  if (skipDocxEnv) {
    log.push(
      "ℹ️ APPLYPANDA_SKIP_DOCX is set — skipping Word export.",
    );
  }

  /** TS flow analysis ignores assignments nested in `saveTailored`; use `.current`. */
  const pdfBrowserRef: { current: Browser | null } = { current: null };

  /** Save PDF when Chromium works (else HTML); also produce .docx from the same HTML when possible. */
  const saveTailored = async (args: {
    html: string;
    pdfStoragePath: string;
    pdfDisplayName: string;
    htmlDisplayName: string;
    kind: "cv" | "cl";
    metadata: Record<string, unknown>;
    logTag: string;
  }): Promise<{ artifactPath: string; docxPath: string | null }> => {
    const {
      html,
      pdfStoragePath,
      pdfDisplayName,
      htmlDisplayName,
      kind,
      metadata,
      logTag,
    } = args;
    const htmlStoragePath = pdfStoragePath.replace(/\.pdf$/i, ".html");
    const docxStoragePath = pdfStoragePath.replace(/\.pdf$/i, ".docx");
    const docxDisplayName = pdfDisplayName.replace(/\.pdf$/i, ".docx");

    const tryDocx = async (): Promise<string | null> => {
      if (skipDocxEnv) return null;
      try {
        const buf = await hostedHtmlToDocxBuffer(html);
        await uploadUserTailoredDocx({
          supabase: auth.supabase,
          userId: uid,
          storagePath: docxStoragePath,
          buffer: buf,
          displayName: docxDisplayName,
          kind,
          metadata: { ...metadata, format: "docx" },
        });
        log.push(`✓ Saved ${logTag} DOCX → ${docxStoragePath}`);
        return docxStoragePath;
      } catch (e) {
        log.push(`⚠️ DOCX (${logTag}): ${(e as Error).message}`);
        return null;
      }
    };

    const saveHtml = async (
      reason: string,
    ): Promise<{ artifactPath: string; docxPath: string | null }> => {
      log.push(`→ ${reason} — ${logTag}: saving printable HTML (${htmlDisplayName})`);
      await uploadUserTailoredHtml({
        supabase: auth.supabase,
        userId: uid,
        storagePath: htmlStoragePath,
        html,
        displayName: htmlDisplayName,
        kind,
        metadata: {
          ...metadata,
          format: "html_printable",
        },
      });
      log.push(`✓ Saved ${logTag} HTML → ${htmlStoragePath}`);
      const docxPath = await tryDocx();
      return { artifactPath: htmlStoragePath, docxPath };
    };

    if (skipPdfEnv) {
      return saveHtml("PDF disabled by env");
    }

    try {
      if (!pdfBrowserRef.current) {
        pdfBrowserRef.current = await launchPdfBrowser();
        log.push("✓ Headless browser ready");
      }
    } catch (e) {
      return saveHtml(`Headless browser failed (${(e as Error).message})`);
    }

    try {
      const pdfBuf = await htmlToPdfWithBrowser(pdfBrowserRef.current, html);
      await uploadUserPdf({
        supabase: auth.supabase,
        userId: uid,
        storagePath: pdfStoragePath,
        buffer: pdfBuf,
        displayName: pdfDisplayName,
        kind,
        metadata: { ...metadata, format: "pdf" },
      });
      log.push(`✓ Saved ${logTag} PDF → ${pdfStoragePath}`);
      const docxPath = await tryDocx();
      return { artifactPath: pdfStoragePath, docxPath };
    } catch (e) {
      log.push(
        `⚠️ PDF rendering failed for ${logTag}: ${(e as Error).message}`,
      );
      return saveHtml("Falling back after PDF failure");
    }
  };

  try {
    let atsStorage: string | null = null;
    let atsDocxStorage: string | null = null;
    let fullStorage: string | null = null;
    let fullDocxStorage: string | null = null;
    let clStorage: string | null = null;
    let clDocxStorage: string | null = null;

    if (kind === "cv" || kind === "both") {
      log.push("→ Generating ATS HTML (model)…");
      const atsText = await runHtmlModel(buildHostedAtsHtmlPrompt(ctx), model);
      const atsHtml = extractHostedHtmlBlock(atsText);
      if (!atsHtml) {
        throw new Error(
          "Could not parse ATS HTML from the model. Try again or switch model.",
        );
      }

      log.push("→ Generating full-length CV HTML (model)…");
      const fullText = await runHtmlModel(buildHostedFullHtmlPrompt(ctx), model);
      const fullHtml = extractHostedHtmlBlock(fullText);
      if (!fullHtml) {
        throw new Error(
          "Could not parse full CV HTML from the model. Try again or switch model.",
        );
      }

      const atsOut = await saveTailored({
        html: atsHtml,
        pdfStoragePath: `${basePath}-ats.pdf`,
        pdfDisplayName: `${company} · ${role} · ATS CV.pdf`,
        htmlDisplayName: `${company} · ${role} · ATS CV.html`,
        kind: "cv",
        metadata: {
          application_num: applicationNum,
          variant: "ats",
          source: "hosted_tailored",
        },
        logTag: "ATS CV",
      });
      atsStorage = atsOut.artifactPath;
      atsDocxStorage = atsOut.docxPath;

      const fullOut = await saveTailored({
        html: fullHtml,
        pdfStoragePath: `${basePath}-full.pdf`,
        pdfDisplayName: `${company} · ${role} · Full CV.pdf`,
        htmlDisplayName: `${company} · ${role} · Full CV.html`,
        kind: "cv",
        metadata: {
          application_num: applicationNum,
          variant: "full",
          source: "hosted_tailored",
        },
        logTag: "full CV",
      });
      fullStorage = fullOut.artifactPath;
      fullDocxStorage = fullOut.docxPath;
    }

    if (kind === "cl" || kind === "both") {
      log.push("→ Generating cover letter HTML (model)…");
      const clText = await runHtmlModel(buildHostedCoverHtmlPrompt(ctx), model);
      const clHtml = extractHostedHtmlBlock(clText);
      if (!clHtml) {
        throw new Error(
          "Could not parse cover letter HTML from the model. Try again or switch model.",
        );
      }

      const clOut = await saveTailored({
        html: clHtml,
        pdfStoragePath: `${basePath}-cover.pdf`,
        pdfDisplayName: `${company} · ${role} · Cover letter.pdf`,
        htmlDisplayName: `${company} · ${role} · Cover letter.html`,
        kind: "cl",
        metadata: {
          application_num: applicationNum,
          source: "hosted_tailored",
        },
        logTag: "cover letter",
      });
      clStorage = clOut.artifactPath;
      clDocxStorage = clOut.docxPath;
    }

    const appPatch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      pdf: "✅",
    };
    if (atsStorage) {
      appPatch.cv_ats_path = atsStorage;
      appPatch.has_cv_ats = true;
    }
    if (atsDocxStorage) {
      appPatch.cv_ats_docx_path = atsDocxStorage;
    }
    if (fullStorage) {
      appPatch.cv_full_path = fullStorage;
      appPatch.has_cv_full = true;
    }
    if (fullDocxStorage) {
      appPatch.cv_full_docx_path = fullDocxStorage;
    }
    if (clStorage) {
      appPatch.cl_path = clStorage;
    }
    if (clDocxStorage) {
      appPatch.cl_docx_path = clDocxStorage;
    }

    const { error: upApp } = await auth.supabase
      .from("applications")
      .update(appPatch)
      .eq("user_id", uid)
      .eq("num", applicationNum);

    if (upApp) {
      throw new Error(`Tracker update failed: ${upApp.message}`);
    }

    log.push("");
    log.push(
      "✅ Done — files are under Documents / tracker (PDF and/or DOCX/HTML per environment; HTML → Print → Save as PDF if needed).",
    );
    return sseFromText(log.join("\n"), 0);
  } catch (e) {
    const msg = (e as Error).message || "Document generation failed";
    return sseFromText(
      `${log.join("\n")}\n\n⚠️ ${msg}`,
      1,
    );
  } finally {
    if (pdfBrowserRef.current) {
      await pdfBrowserRef.current.close().catch(() => {});
    }
  }
}
