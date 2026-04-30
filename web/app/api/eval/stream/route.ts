import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/supabase/api";
import { sseError, sseFromText, runGeminiPrompt } from "@/lib/gemini-runtime";

export const dynamic = "force-dynamic";

/**
 * Streams Gemini-based evaluation output via SSE.
 *
 * Body shape:
 *   { jdText: string, sourceUrl?: string, model?: string }
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) {
    return sseError("Unauthorized", 401);
  }
  let body: { jdText?: string; sourceUrl?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return sseError("Invalid JSON", 400);
  }
  const jdText = (body.jdText ?? "").trim();
  if (!jdText) {
    return sseError("jdText required", 400);
  }

  const prompt = `You are an expert job-fit evaluator.\nReturn concise GitHub markdown with sections:\n1) Role and company summary\n2) Fit score (0-5 with one decimal)\n3) Strengths (bullet list)\n4) Risks/Gaps (bullet list)\n5) Recommendation (Apply / Skip) with one-paragraph rationale\n6) Next actions (3 bullets)\n\n${body.sourceUrl ? `Source URL: ${body.sourceUrl}\n` : ""}\nJob description:\n---\n${jdText.slice(0, 24000)}\n---`;
  try {
    const text = await runGeminiPrompt(prompt, body.model);
    return sseFromText(text);
  } catch (e) {
    return sseError((e as Error).message || "Evaluation failed", 500);
  }
}
