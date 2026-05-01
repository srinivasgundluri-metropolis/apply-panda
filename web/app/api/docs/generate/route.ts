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
import {
  slugTailoredSegment,
  uploadUserPdf,
  uploadUserTailoredHtml,
} from "@/lib/tailored-docs-storage";

export const dynamic = "force-dynamic";

/** Model + Chromium PDF on Vercel can need the full allowance. */
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

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function stripHtmlToText(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTextLine(s: string): string {
  return s
    .toLowerCase()
    .replace(/[`*_#>-]/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function markdownBulletLines(md: string): string[] {
  return md
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-*+]\s+/.test(l) || /^\d+\.\s+/.test(l))
    .map((l) => normalizeTextLine(l.replace(/^([-*+]|\d+\.)\s+/, "")))
    .filter((l) => l.length >= 12);
}

function htmlBulletLines(html: string): string[] {
  const out: string[] = [];
  const re = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(html))) {
    const raw = stripHtmlToText(m[1]);
    const norm = normalizeTextLine(raw);
    if (norm.length >= 12) out.push(norm);
  }
  return out;
}

/**
 * Flags low-tailoring drafts where most bullets were copied verbatim from SOURCE_CV.
 * We allow some overlap (facts must stay true), but not near-total bullet reuse.
 */
function shouldRetryForLowTailoring(
  html: string,
  cvMarkdown: string,
  reportExcerpt: string,
): boolean {
  const gen = htmlBulletLines(html);
  if (gen.length < 3) return false;
  const src = markdownBulletLines(cvMarkdown);
  if (src.length === 0) return false;

  const srcSet = new Set(src);
  let copied = 0;
  for (const line of gen) {
    if (srcSet.has(line)) copied++;
  }
  const copiedRatio = copied / gen.length;

  const hasJobContext = reportExcerpt.trim().length > 80;
  const threshold = hasJobContext ? 0.55 : 0.72;
  return copiedRatio >= threshold;
}

function tailoringRetrySuffix(args: {
  kind: "ats" | "full" | "cl";
  company: string;
  role: string;
}): string {
  const flavor =
    args.kind === "ats"
      ? "ATS CV"
      : args.kind === "full"
        ? "FULL CV"
        : "COVER LETTER";
  return `\n\nRETRY INSTRUCTION (${flavor}):\n- The previous draft was too close to SOURCE_CV wording.\n- Rewrite to be truly tailored for ${args.role} at ${args.company}.\n- Keep facts identical, but reframe bullets around the role requirements from REPORT / JOB CONTEXT.\n- Do NOT copy bullet sentences verbatim from SOURCE_CV.\n- Reorder sections and bullets by relevance to this role.\n- Make the fit explicit in wording (tools, domain, outcomes) without inventing anything.`;
}

function isLikelyHttpUrl(s: string): boolean {
  return /^https?:\/\/\S+$/i.test(s.trim());
}

function extractLinkedinFromProfileData(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const candidate =
    obj.candidate && typeof obj.candidate === "object" && !Array.isArray(obj.candidate)
      ? (obj.candidate as Record<string, unknown>)
      : null;

  const maybe =
    (typeof candidate?.linkedin === "string" ? candidate.linkedin : null) ??
    (typeof obj.linkedin === "string" ? obj.linkedin : null);
  if (!maybe) return null;
  const v = maybe.trim();
  if (!v) return null;
  if (isLikelyHttpUrl(v)) return v;
  if (/^linkedin\.com\//i.test(v) || /^www\.linkedin\.com\//i.test(v)) {
    return `https://${v.replace(/^https?:\/\//i, "")}`;
  }
  return null;
}

/**
 * If model outputs just "LinkedIn" label in header, substitute full URL from profile.
 * This keeps rendered docs actionable even when markdown->HTML conversion dropped anchor hrefs.
 */
function enforceLinkedinUrlInHtml(html: string, linkedinUrl: string | null): string {
  if (!linkedinUrl) return html;
  const hasLinkedinUrl = /https?:\/\/(?:www\.)?linkedin\.com\/[^\s<)"]+/i.test(html);
  if (hasLinkedinUrl) return html;

  const headerWindow = Math.min(2200, html.length);
  const head = html.slice(0, headerWindow);
  const tail = html.slice(headerWindow);

  const replaced = head
    .replace(
      /\|\s*LinkedIn\s*(?=\||<|\n|$)/i,
      `| <a href="${linkedinUrl}">${linkedinUrl}</a>`,
    )
    .replace(
      /\bLinkedIn\b(?![^<]*<\/a>)/i,
      `<a href="${linkedinUrl}">${linkedinUrl}</a>`,
    );
  return replaced + tail;
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
  const fallbackLinkedinUrl = extractLinkedinFromProfileData(prof?.data);

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
  const slug = slugTailoredSegment(`${company}-${role}`);
  const basePath = `${uid}/tailored/${applicationNum}-${slug}`;

  const log: string[] = [];

  const skipPdfEnv = ["1", "true", "yes"].includes(
    (process.env.APPLYPANDA_SKIP_PDF ?? "").trim().toLowerCase(),
  );
  if (skipPdfEnv) {
    log.push(
      "ℹ️ APPLYPANDA_SKIP_PDF — skipping Chromium; saving one-page printable HTML only.",
    );
  }

  const pdfBrowserRef: { current: Browser | null } = { current: null };

  /** Target: single-page Letter PDF when Chromium works; else printable HTML fallback. Tracker stores the canonical path. */
  const saveTailored = async (args: {
    html: string;
    pdfStoragePath: string;
    pdfDisplayName: string;
    htmlDisplayName: string;
    kind: "cv" | "cl";
    metadata: Record<string, unknown>;
    logTag: string;
  }): Promise<string> => {
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

    const saveHtml = async (reason: string): Promise<string> => {
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
      return htmlStoragePath;
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
      log.push(`✓ Saved ${logTag} PDF (one page target) → ${pdfStoragePath}`);
      return pdfStoragePath;
    } catch (e) {
      log.push(
        `⚠️ PDF rendering failed for ${logTag}: ${(e as Error).message}`,
      );
      return saveHtml("Falling back after PDF failure");
    }
  };

  try {
    let atsStorage: string | null = null;
    let fullStorage: string | null = null;
    let clStorage: string | null = null;

    if (kind === "cv" || kind === "both") {
      log.push("→ Generating ATS HTML (model, one-page layout)…");
      const atsPrompt = buildHostedAtsHtmlPrompt(ctx);
      const atsText = await runHtmlModel(atsPrompt, model);
      let atsHtml = extractHostedHtmlBlock(atsText);
      if (!atsHtml) {
        throw new Error(
          "Could not parse ATS HTML from the model. Try again or switch model.",
        );
      }
      if (shouldRetryForLowTailoring(atsHtml, cvMarkdown, reportExcerpt)) {
        log.push("↻ ATS draft looked too close to base CV; retrying with stronger tailoring instructions…");
        const retryText = await runHtmlModel(
          atsPrompt +
            tailoringRetrySuffix({
              kind: "ats",
              company,
              role,
            }),
          model,
        );
        const retryHtml = extractHostedHtmlBlock(retryText);
        if (retryHtml) atsHtml = retryHtml;
      }
      atsHtml = enforceLinkedinUrlInHtml(atsHtml, fallbackLinkedinUrl);

      log.push("→ Generating full CV HTML (model, one-page layout)…");
      const fullPrompt = buildHostedFullHtmlPrompt(ctx);
      const fullText = await runHtmlModel(fullPrompt, model);
      let fullHtml = extractHostedHtmlBlock(fullText);
      if (!fullHtml) {
        throw new Error(
          "Could not parse full CV HTML from the model. Try again or switch model.",
        );
      }
      if (shouldRetryForLowTailoring(fullHtml, cvMarkdown, reportExcerpt)) {
        log.push("↻ Full CV draft looked too close to base CV; retrying with stronger tailoring instructions…");
        const retryText = await runHtmlModel(
          fullPrompt +
            tailoringRetrySuffix({
              kind: "full",
              company,
              role,
            }),
          model,
        );
        const retryHtml = extractHostedHtmlBlock(retryText);
        if (retryHtml) fullHtml = retryHtml;
      }
      fullHtml = enforceLinkedinUrlInHtml(fullHtml, fallbackLinkedinUrl);

      atsStorage = await saveTailored({
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

      fullStorage = await saveTailored({
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
    }

    if (kind === "cl" || kind === "both") {
      log.push("→ Generating cover letter HTML (model, one-page layout)…");
      const clPrompt = buildHostedCoverHtmlPrompt(ctx);
      const clText = await runHtmlModel(clPrompt, model);
      let clHtml = extractHostedHtmlBlock(clText);
      if (!clHtml) {
        throw new Error(
          "Could not parse cover letter HTML from the model. Try again or switch model.",
        );
      }
      /**
       * CLs can also come out too generic. Reuse the same anti-copy guard:
       * if many lines mirror resume bullets, force a rewrite with role-specific framing.
       */
      if (shouldRetryForLowTailoring(clHtml, cvMarkdown, reportExcerpt)) {
        log.push("↻ Cover letter looked generic/copied; retrying with stronger JD alignment…");
        const retryText = await runHtmlModel(
          clPrompt +
            tailoringRetrySuffix({
              kind: "cl",
              company,
              role,
            }),
          model,
        );
        const retryHtml = extractHostedHtmlBlock(retryText);
        if (retryHtml) clHtml = retryHtml;
      }
      clHtml = enforceLinkedinUrlInHtml(clHtml, fallbackLinkedinUrl);

      clStorage = await saveTailored({
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
    }

    const appPatch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      pdf: "✅",
    };
    if (kind === "cv" || kind === "both") {
      appPatch.cv_ats_docx_path = null;
      appPatch.cv_full_docx_path = null;
    }
    if (kind === "cl" || kind === "both") {
      appPatch.cl_docx_path = null;
    }
    if (atsStorage) {
      appPatch.cv_ats_path = atsStorage;
      appPatch.has_cv_ats = true;
    }
    if (fullStorage) {
      appPatch.cv_full_path = fullStorage;
      appPatch.has_cv_full = true;
    }
    if (clStorage) {
      appPatch.cl_path = clStorage;
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
      "✅ Done — downloads are PDF when Chromium succeeded (.pdf paths), else printable HTML. Layout is modeled for one Letter page each.",
    );
    return sseFromText(log.join("\n"), 0);
  } catch (e) {
    const msg = (e as Error).message || "Document generation failed";
    return sseFromText(`${log.join("\n")}\n\n⚠️ ${msg}`, 1);
  } finally {
    if (pdfBrowserRef.current) {
      await pdfBrowserRef.current.close().catch(() => {});
    }
  }
}
