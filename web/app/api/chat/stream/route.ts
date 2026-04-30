import { NextRequest } from "next/server";
import { readProfile, candidateFirstName } from "@/lib/profile";
import { requireApiUser } from "@/lib/supabase/api";
import { buildChatPrompt } from "@/lib/prompts";
import {
  runGeminiPromptWithConfig,
  sseFromText,
  sseError,
} from "@/lib/gemini-runtime";

export const dynamic = "force-dynamic";
const CHAT_COOLDOWN_MS = 5000;
const cooldownByUser = new Map<string, number>();

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
  const now = Date.now();
  const last = cooldownByUser.get(auth.user.id) ?? 0;
  const remainingMs = CHAT_COOLDOWN_MS - (now - last);
  if (remainingMs > 0) {
    const sec = Math.ceil(remainingMs / 1000);
    return sseError(
      `Please wait ${sec}s before sending another message (rate limit protection).`,
      429,
    );
  }
  cooldownByUser.set(auth.user.id, now);
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
    const text = await runGeminiPromptWithConfig(prompt, body.model, {
      // Keep chat lighter to avoid hitting Gemini TPM limits.
      maxOutputTokens: 1536,
      temperature: 0.3,
    });
    return sseFromText(text);
  } catch (e) {
    const msg = (e as Error).message || "Chat failed";
    if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
      return sseError(
        "Gemini is rate-limiting requests right now. Please wait ~15s and retry one message at a time.",
        429,
      );
    }
    return sseError(msg, 500);
  }
}
