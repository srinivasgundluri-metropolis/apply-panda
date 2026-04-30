import { NextRequest } from "next/server";
import { streamProcess, SSE_HEADERS } from "@/lib/shell";

function sseSingleError(message: string): Response {
  return new Response(`data: ${JSON.stringify({ type: "error", message })}\n\n`, {
    status: 200,
    headers: SSE_HEADERS,
  });
}
import { buildCvPrompt, buildCoverLetterPrompt } from "@/lib/prompts";
import { REPO_ROOT } from "@/lib/paths";
import { readCoverLetterVoiceExcerpt } from "@/lib/resume-coach";

export const dynamic = "force-dynamic";

/**
 * Streams cursor-agent running the `pdf` mode for tailored CV / cover
 * letter generation. The agent reads the evaluation report (if any) so
 * it can lift JD keywords and the detected archetype into the document.
 *
 * Body shape:
 *   { kind: "cv" | "cl" | "both", company, role, reportRel?: string,
 *     regenerate?: boolean, canonicalStatus?: string, model? }
 *
 * When `regenerate` is true, prompts tell the agent to replace prior tailored
 * PDFs and re-read `cv.md` + profile. Forbidden when `canonicalStatus`
 * is `Applied` (returns SSE error frame).
 *
 * For `kind: "both"`, one agent run generates **ATS + full-length CV PDFs**
 * (see `buildCvPrompt`) and the cover letter PDF.
 */
export async function POST(req: NextRequest) {
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
    return new Response(
      `data: ${JSON.stringify({ type: "error", message: "Invalid JSON" })}\n\n`,
      { status: 400, headers: SSE_HEADERS },
    );
  }
  const company = (body.company ?? "").trim();
  const role = (body.role ?? "").trim();
  const kind = body.kind;
  if (!company || !role || !kind) {
    return new Response(
      `data: ${JSON.stringify({
        type: "error",
        message: "company, role, and kind are required",
      })}\n\n`,
      { status: 400, headers: SSE_HEADERS },
    );
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

  const args = ["-p", "--force", "--trust", "--workspace", REPO_ROOT];
  if (body.model) args.push("--model", body.model);
  args.push(prompt);

  const stream = streamProcess("cursor-agent", args);
  return new Response(stream, { headers: SSE_HEADERS });
}
