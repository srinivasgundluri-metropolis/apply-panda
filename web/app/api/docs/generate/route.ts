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
import { htmlToPdfWithBrowser, launchPdfBrowser } from "@/lib/pdf-from-html";
import { slugTailoredSegment, uploadUserPdf } from "@/lib/tailored-docs-storage";

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

  let browser: Awaited<ReturnType<typeof launchPdfBrowser>> | null = null;

  try {
    browser = await launchPdfBrowser();
    log.push("✓ Headless browser ready");

    let atsStorage: string | null = null;
    let fullStorage: string | null = null;
    let clStorage: string | null = null;

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

      log.push("→ Rendering ATS PDF…");
      const atsPdf = await htmlToPdfWithBrowser(browser, atsHtml);
      atsStorage = `${basePath}-ats.pdf`;
      await uploadUserPdf({
        supabase: auth.supabase,
        userId: uid,
        storagePath: atsStorage,
        buffer: atsPdf,
        displayName: `${company} · ${role} · ATS CV.pdf`,
        kind: "cv",
        metadata: {
          application_num: applicationNum,
          variant: "ats",
          source: "hosted_tailored",
        },
      });
      log.push(`✓ Saved ATS CV → ${atsStorage}`);

      log.push("→ Rendering full-length CV PDF…");
      const fullPdf = await htmlToPdfWithBrowser(browser, fullHtml);
      fullStorage = `${basePath}-full.pdf`;
      await uploadUserPdf({
        supabase: auth.supabase,
        userId: uid,
        storagePath: fullStorage,
        buffer: fullPdf,
        displayName: `${company} · ${role} · Full CV.pdf`,
        kind: "cv",
        metadata: {
          application_num: applicationNum,
          variant: "full",
          source: "hosted_tailored",
        },
      });
      log.push(`✓ Saved full CV → ${fullStorage}`);
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

      log.push("→ Rendering cover letter PDF…");
      const clPdf = await htmlToPdfWithBrowser(browser, clHtml);
      clStorage = `${basePath}-cover.pdf`;
      await uploadUserPdf({
        supabase: auth.supabase,
        userId: uid,
        storagePath: clStorage,
        buffer: clPdf,
        displayName: `${company} · ${role} · Cover letter.pdf`,
        kind: "cl",
        metadata: {
          application_num: applicationNum,
          source: "hosted_tailored",
        },
      });
      log.push(`✓ Saved cover letter → ${clStorage}`);
    }

    const appPatch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      pdf: "✅",
    };
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
    log.push("✅ Done — PDFs are in Documents and this tracker row is updated.");
    return sseFromText(log.join("\n"), 0);
  } catch (e) {
    const msg = (e as Error).message || "Document generation failed";
    return sseFromText(
      `${log.join("\n")}\n\n⚠️ ${msg}`,
      1,
    );
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
