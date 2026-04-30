import { NextRequest } from "next/server";
import { sseError, sseFromText, runGeminiPrompt } from "@/lib/gemini-runtime";

function sseSingleError(message: string): Response {
  return sseError(message, 200);
}
import { buildCvPrompt, buildCoverLetterPrompt } from "@/lib/prompts";
import { readCoverLetterVoiceExcerpt } from "@/lib/resume-coach";
import { requireApiUser } from "@/lib/supabase/api";

export const dynamic = "force-dynamic";

/**
 * Streams Gemini-based draft output for tailored CV / cover letter generation.
 *
 * Body shape:
 *   { kind: "cv" | "cl" | "both", company, role, reportRel?: string,
 *     regenerate?: boolean, canonicalStatus?: string, model? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) {
    return sseError("Unauthorized", 401);
  }
  let body: {
    kind?: "cv" | "cl" | "both";
    company?: string;
    role?: string;
    reportRel?: string;
    regenerate?: boolean;
    canonicalStatus?: string;
    model?: string;
  };
  try {
    body = await req.json();
  } catch {
    return sseError("Invalid JSON", 400);
  }
  const company = (body.company ?? "").trim();
  const role = (body.role ?? "").trim();
  const kind = body.kind;
  if (!company || !role || !kind) {
    return sseError("company, role, and kind are required", 400);
  }

  const regenerate = Boolean(body.regenerate);
  const canonicalStatus = (body.canonicalStatus ?? "").trim();
  if (regenerate && canonicalStatus === "Applied") {
    return sseSingleError(
      "Regeneration is disabled once this row is marked Applied (preserves submission-time PDFs).",
    );
  }

  const voice = await readCoverLetterVoiceExcerpt();
  const pdfOpts = {
    regenerate,
    ...(voice.trim()
      ? { coverLetterVoice: voice }
      : {}),
  };

  let prompt: string;
  if (kind === "cv") {
    prompt = buildCvPrompt(company, role, body.reportRel, pdfOpts);
  } else if (kind === "cl") {
    prompt = buildCoverLetterPrompt(company, role, body.reportRel, pdfOpts);
  } else {
    // "both" — chain the two prompts in one agent run.
    prompt =
      buildCvPrompt(company, role, body.reportRel, pdfOpts) +
      "\n\n---\n\nThen, separately:\n\n" +
      buildCoverLetterPrompt(company, role, body.reportRel, pdfOpts) +
      "\n\nProduce the CV pair (ATS + full) then the cover letter. " +
        "Print DONE lines as specified in each prompt section.";
  }

  try {
    const text = await runGeminiPrompt(prompt, body.model);
    return sseFromText(text);
  } catch (e) {
    return sseError((e as Error).message || "Document generation failed", 500);
  }
}
