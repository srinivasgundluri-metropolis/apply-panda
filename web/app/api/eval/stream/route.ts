import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/supabase/api";
import { sseError, sseFromText, runGeminiPrompt } from "@/lib/gemini-runtime";
import {
  persistEvalToSupabase,
  resolveEvalMeta,
  splitEvalResponse,
} from "@/lib/eval-persist";

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

  const prompt = `You are an expert job-fit evaluator.
Return concise GitHub-flavored Markdown with sections:
1) Role and company summary (use ONE top-level markdown heading "# {Company name} — {Short role title}" so parsers can infer fields)
2) Fit score as "X.X/5"
3) Strengths (bullet list)
4) Risks/Gaps (bullet list)
5) Recommendation starting with Apply or Skip, plus one short paragraph rationale
6) Next actions (3 bullets)

After those sections ONLY, emit this exact machine-readable block on its own lines (JSON must be UTF-8, no Markdown code fences, company and role must be plain short strings):

<<<EVAL_META
{"company":"Short employer","role":"Job title","score":4.2,"legitimacy":"unknown","recommendation":"Apply","notes":"Single-line summary"}
>>>

score is a JSON number between 0 and 5 with at most one decimal. legitimacy MUST be exactly one of: strong, moderate, weak, unknown. recommendation MUST start with Apply or Skip (you may append text after Skip/Apply).

${body.sourceUrl ? `Source URL: ${body.sourceUrl}\n` : ""}
Job description:
---
${jdText.slice(0, 24000)}
---`;
  try {
    const text = await runGeminiPrompt(prompt, body.model);
    const { displayMarkdown, metaJson } = splitEvalResponse(text);
    const meta = resolveEvalMeta({
      displayMarkdown,
      metaJson,
      sourceUrl: body.sourceUrl ?? null,
    });
    try {
      const { num } = await persistEvalToSupabase({
        supabase: auth.supabase,
        userId: auth.user.id,
        sourceUrl: body.sourceUrl ?? null,
        displayMarkdown,
        meta,
      });
      return sseFromText(
        `${displayMarkdown}\n\n---\n✅ Saved to tracker and reports as #${num} (refresh Tracker / Dashboard).`,
      );
    } catch (persistErr) {
      const msg = (persistErr as Error).message || "persist failed";
      return sseFromText(
        `${displayMarkdown}\n\n---\n⚠️ Evaluation finished but could not save to your account: ${msg}`,
        1,
      );
    }
  } catch (e) {
    return sseError((e as Error).message || "Evaluation failed", 500);
  }
}
