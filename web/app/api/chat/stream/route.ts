import { NextRequest } from "next/server";
import { readProfile, candidateFirstName } from "@/lib/profile";
import { requireApiUser } from "@/lib/supabase/api";
import { buildChatPrompt } from "@/lib/prompts";
import { runGeminiPrompt, sseFromText, sseError } from "@/lib/gemini-runtime";

export const dynamic = "force-dynamic";

/**
 * Streams Gemini output for assistant chat via SSE.
 *
 * Body shape:
 *   { message: string, history: [{role, content}, ...], model?: string }
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) {
    return sseError("Unauthorized", 401);
  }
  let body: {
    message?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
    model?: string;
  };
  try {
    body = await req.json();
  } catch {
    return sseError("Invalid JSON", 400);
  }
  const message = (body.message ?? "").trim();
  if (!message) {
    return sseError("Empty message", 400);
  }

  const profile = await readProfile();
  const first = candidateFirstName(profile);
  const prompt = buildChatPrompt(message, body.history ?? [], first);
  try {
    const text = await runGeminiPrompt(prompt, body.model);
    return sseFromText(text);
  } catch (e) {
    return sseError((e as Error).message || "Chat failed", 500);
  }
}
