/**
 * LLM-powered updates to canonical resume/profile data in Supabase.
 */

import { geminiGenerateContent, formatGeminiHttpError } from "./gemini-generate";
import { writeProfile, readProfile } from "./profile";
import { resolveGeminiApiKey } from "./outreach-mail";
import { createSupabaseServerClient } from "./supabase/server";
import type { Profile } from "./types";

const MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";
const COACH_JSON_SCHEMA = `{
  "cv_md": string | null,
  "profile_updates": object | null,
  "cover_letter_base_md": string | null,
  "chat_reply_md": string
}`;

export interface CoachApplyResult {
  chat_reply_md: string;
  updated: { cv: boolean; profile: boolean; coverLetterBase: boolean };
}

function parseCoachJson(raw: string): Record<string, unknown> {
  let t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  return JSON.parse(t) as Record<string, unknown>;
}

const PROFILE_KEYS = new Set([
  "candidate",
  "target_roles",
  "narrative",
  "language",
  "compensation",
  "location",
  "cv",
  "comp_targets",
]);

function sanitizeProfilePatch(p: unknown): Record<string, unknown> | null {
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
    if (PROFILE_KEYS.has(k)) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

export function buildInstructionFromUploadedResumeExtract(
  extractedPlainText: string,
  userNotes?: string,
): string {
  const clipped = extractedPlainText.slice(0, 80_000);
  const notes = (userNotes ?? "").trim();
  return `The user uploaded a résumé PDF. Plain text extracted from that PDF appears below — treat it as the primary source of truth.

Your job:
1. Produce a **full replacement** Markdown body for canonical resume markdown.
2. Populate \`profile_updates\` when inferable from résumé text and existing profile.
3. Only change \`cover_letter_base_md\` when user notes request cover-letter preference updates.

${notes ? `Additional instructions from the user:\n---\n${notes}\n---\n\n` : ""}Extracted résumé text:\n---\n${clipped}\n---`;
}

export async function applyResumeCoachInstruction(
  instruction: string,
): Promise<CoachApplyResult> {
  const key = await resolveGeminiApiKey();
  if (!key) throw new Error("OPENAI_API_KEY is not set in environment.");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error("Unauthorized");

  const [profile, resumeRow] = await Promise.all([
    readProfile(),
    supabase
      .from("resumes")
      .select("content_md")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  const cvRaw = String(resumeRow.data?.content_md ?? "");
  const coverRaw = String((profile as Record<string, unknown>).cover_letter_base_md ?? "");
  const profileJson = JSON.stringify(profile, null, 2);

  const prompt = `You help job seekers maintain profile data. Output ONLY valid JSON.

The user instruction:
---
${instruction.slice(0, 12000)}
---

Current canonical resume markdown:
---
${cvRaw.slice(0, 32000)}
---

Current profile JSON:
---
${profileJson.slice(0, 20000)}
---

Current cover-letter base markdown:
---
${coverRaw.slice(0, 12000)}
---

Rules:
- \`cv_md\`: full replacement markdown or null.
- \`profile_updates\`: deep-merge patch (top-level profile keys) or null.
- \`cover_letter_base_md\`: full markdown or null.
- \`chat_reply_md\`: concise markdown summary.
- Do not invent achievements/metrics.

JSON shape:
${COACH_JSON_SCHEMA}`;

  const res = await geminiGenerateContent(MODEL, key, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.35, maxOutputTokens: 8192 },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(formatGeminiHttpError(res.status, t));
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("LLM returned empty output");

  const parsed = parseCoachJson(text);
  const chatReply = String(parsed.chat_reply_md ?? "").trim();
  if (!chatReply) throw new Error("Model did not return chat_reply_md");

  const updated = { cv: false, profile: false, coverLetterBase: false };

  const cvMd = parsed.cv_md;
  if (typeof cvMd === "string" && cvMd.trim()) {
    const { error } = await supabase
      .from("resumes")
      .upsert(
        {
          user_id: user.id,
          content_md: cvMd,
          updated_at: new Date().toISOString(),
          source: "coach",
        },
        { onConflict: "user_id" },
      );
    if (error) throw error;
    updated.cv = true;
  }

  const patch = sanitizeProfilePatch(parsed.profile_updates);
  if (patch) {
    await writeProfile(patch as Profile);
    updated.profile = true;
  }

  const clBase = parsed.cover_letter_base_md;
  if (typeof clBase === "string" && clBase.trim()) {
    await writeProfile({ cover_letter_base_md: clBase } as unknown as Profile);
    updated.coverLetterBase = true;
  }

  return { chat_reply_md: chatReply, updated };
}

export async function readCoverLetterVoiceExcerpt(maxChars = 10000): Promise<string> {
  const profile = await readProfile();
  return String((profile as Record<string, unknown>).cover_letter_base_md ?? "").slice(
    0,
    maxChars,
  );
}
