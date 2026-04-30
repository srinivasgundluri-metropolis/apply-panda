/**
 * Gemini-powered updates to cv.md, config/profile.yml, and
 * config/cover-letter-base.md from natural-language instructions.
 */

import { readFile, writeFile, copyFile, access, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  CV_PATH,
  COVER_LETTER_BASE_PATH,
  PROFILE_PATH,
} from "./paths";
import { geminiGenerateContent, formatGeminiHttpError } from "./gemini-generate";
import { writeProfile } from "./profile";
import { resolveGeminiApiKey } from "./outreach-mail";
import type { Profile } from "./types";

const MODEL = "gemini-2.0-flash";

export interface CoachApplyResult {
  chat_reply_md: string;
  updated: {
    cv: boolean;
    profile: boolean;
    coverLetterBase: boolean;
  };
}

function parseCoachJson(raw: string): Record<string, unknown> {
  let t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const obj = JSON.parse(t) as Record<string, unknown>;
  return obj;
}

/** Allowlisted top-level keys we merge into profile.yml */
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

function sanitizeProfilePatch(
  p: unknown,
): Record<string, unknown> | null {
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
    if (PROFILE_KEYS.has(k)) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

async function exists(p: string): Promise<boolean> {
  return access(p).then(
    () => true,
    () => false,
  );
}

export async function applyResumeCoachInstruction(
  instruction: string,
): Promise<CoachApplyResult> {
  const key = await resolveGeminiApiKey();
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not configured — add it to the repo .env or environment.",
    );
  }

  const [cvRaw, coverRaw] = await Promise.all([
    exists(CV_PATH).then((ok) =>
      ok ? readFile(CV_PATH, "utf-8") : "",
    ),
    exists(COVER_LETTER_BASE_PATH).then((ok) =>
      ok ? readFile(COVER_LETTER_BASE_PATH, "utf-8") : "",
    ),
  ]);

  const profileYaml =
    (await exists(PROFILE_PATH))
      ? await readFile(PROFILE_PATH, "utf-8")
      : "";

  const prompt = `You help job seekers maintain their career-ops files. Output **ONLY valid JSON** (no markdown fences, no commentary before/after).

The user instruction:
---
${instruction.slice(0, 12000)}
---

Current \`cv.md\` (may be empty):
---
${cvRaw.slice(0, 32000)}
---

Current \`config/profile.yml\` raw (may be empty):
---
${profileYaml.slice(0, 16000)}
---

Current \`config/cover-letter-base.md\` (cover letter tone, structure, optional — may be empty):
---
${coverRaw.slice(0, 12000)}
---

Rules:
- **cv_md**: If the user wants changes to the résumé, return the **full new** markdown for cv.md. If no cv.md change, use null.
- **profile_updates**: Partial YAML-serializable object to **deep-merge** into profile (top-level keys like candidate, target_roles, narrative only). Use null if no profile change.
- **cover_letter_base_md**: Full markdown for config/cover-letter-base.md (opening/closing style, paragraph length, formality, what to always mention). Null if no change.
- **chat_reply_md**: Short friendly markdown for the user summarizing what you changed and what they should do next (mention they can regenerate tailored PDFs from the Tracker for roles not yet marked Applied).

Do not invent employers, degrees, or metrics. If the user asks for something you cannot ground in the text above, say so in chat_reply_md and leave file fields null.

JSON shape (use null, omit keys only if null everywhere is wrong — prefer explicit nulls):
{
  "cv_md": string | null,
  "profile_updates": object | null,
  "cover_letter_base_md": string | null,
  "chat_reply_md": string
}`;

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
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
    "";
  if (!text.trim()) throw new Error("Gemini returned empty output");

  let parsed: Record<string, unknown>;
  try {
    parsed = parseCoachJson(text);
  } catch {
    throw new Error("Could not parse model JSON output");
  }

  const chatReply = String(parsed.chat_reply_md ?? "").trim();
  if (!chatReply) {
    throw new Error("Model did not return chat_reply_md");
  }

  const updated = { cv: false, profile: false, coverLetterBase: false };

  const cvMd = parsed.cv_md;
  if (typeof cvMd === "string" && cvMd.trim()) {
    await mkdir(dirname(CV_PATH), { recursive: true });
    try {
      await access(CV_PATH);
      await copyFile(CV_PATH, `${CV_PATH}.bak`);
    } catch {
      /* no prior */
    }
    await writeFile(CV_PATH, cvMd, "utf-8");
    updated.cv = true;
  }

  const patch = sanitizeProfilePatch(parsed.profile_updates);
  if (patch) {
    await writeProfile(patch as Profile);
    updated.profile = true;
  }

  const clBase = parsed.cover_letter_base_md;
  if (typeof clBase === "string" && clBase.trim()) {
    await mkdir(dirname(COVER_LETTER_BASE_PATH), { recursive: true });
    try {
      await access(COVER_LETTER_BASE_PATH);
      await copyFile(COVER_LETTER_BASE_PATH, `${COVER_LETTER_BASE_PATH}.bak`);
    } catch {
      /* no prior */
    }
    await writeFile(COVER_LETTER_BASE_PATH, clBase, "utf-8");
    updated.coverLetterBase = true;
  }

  return {
    chat_reply_md: chatReply,
    updated,
  };
}

export async function readCoverLetterVoiceExcerpt(
  maxChars = 10000,
): Promise<string> {
  try {
    await access(COVER_LETTER_BASE_PATH);
    const raw = await readFile(COVER_LETTER_BASE_PATH, "utf-8");
    return raw.slice(0, maxChars);
  } catch {
    return "";
  }
}
