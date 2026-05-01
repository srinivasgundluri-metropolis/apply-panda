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
  "profile_updates": string | null, // JSON string containing top-level profile patch object
  "cover_letter_base_md": string | null,
  "chat_reply_md": string
}`;

export interface CoachApplyResult {
  chat_reply_md: string;
  updated: { cv: boolean; profile: boolean; coverLetterBase: boolean };
  profile_fields_updated: string[];
}

function parseCoachJson(raw: string): Record<string, unknown> {
  let t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t) as Record<string, unknown>;
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(t.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error("Model response was not valid JSON.");
  }
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

const PROFILE_KEY_ALIASES: Record<string, string> = {
  targeting: "target_roles",
  targetting: "target_roles",
  targetroles: "target_roles",
  target_role: "target_roles",
  "target-roles": "target_roles",
  compensation_targets: "comp_targets",
  compensationTargets: "comp_targets",
  compensation_target: "comp_targets",
};

function normalizeTopLevelProfileKey(raw: string): string {
  const key = raw.trim();
  if (!key) return key;
  const direct = PROFILE_KEY_ALIASES[key];
  if (direct) return direct;
  const lower = PROFILE_KEY_ALIASES[key.toLowerCase()];
  if (lower) return lower;
  return key;
}

function sanitizeProfilePatch(p: unknown): Record<string, unknown> | null {
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  let src = p as Record<string, unknown>;
  /** Some models wrap the actual patch under `profile` or `profile_updates`. */
  if (
    src.profile &&
    typeof src.profile === "object" &&
    !Array.isArray(src.profile)
  ) {
    src = src.profile as Record<string, unknown>;
  } else if (
    src.profile_updates &&
    typeof src.profile_updates === "object" &&
    !Array.isArray(src.profile_updates)
  ) {
    src = src.profile_updates as Record<string, unknown>;
  }
  const out: Record<string, unknown> = {};
  for (const [rawK, v] of Object.entries(src)) {
    const k = normalizeTopLevelProfileKey(rawK);
    if (PROFILE_KEYS.has(k)) out[k] = v;
  }
  normalizeNarrativeArraysInPatch(out);
  return Object.keys(out).length ? out : null;
}

function splitMaybeMultiPointLine(line: string, allowCommaHeuristic: boolean): string[] {
  const base = line.trim();
  if (!base) return [];
  const semis = base.split(/\s*;\s*/).map((x) => x.trim()).filter(Boolean);
  if (semis.length > 1) return semis;
  if (!allowCommaHeuristic) return [base];

  /**
   * If a single line is very long and has multiple comma clauses, it is usually
   * several points packed into one sentence. Split conservatively.
   */
  const commaCount = (base.match(/,/g) ?? []).length;
  if (base.length >= 110 && commaCount >= 2) {
    return base
      .split(/\s*,\s*/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 8);
  }
  return [base];
}

function normalizeOnePerLineList(
  input: unknown,
  allowCommaHeuristic: boolean,
): string[] | null {
  const rawItems: string[] = [];
  if (Array.isArray(input)) {
    for (const v of input) {
      if (typeof v === "string" && v.trim()) rawItems.push(v.trim());
    }
  } else if (typeof input === "string" && input.trim()) {
    rawItems.push(input.trim());
  } else {
    return null;
  }

  const exploded = rawItems.flatMap((item) =>
    item
      .split(/\r?\n+/)
      .map((x) => x.replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, "").trim())
      .filter(Boolean)
      .flatMap((line) => splitMaybeMultiPointLine(line, allowCommaHeuristic)),
  );

  const dedup = [...new Set(exploded.map((x) => x.trim()).filter(Boolean))];
  return dedup.length ? dedup : null;
}

function normalizeNarrativeArraysInPatch(patch: Record<string, unknown>): void {
  const raw = patch.narrative;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const narrative = { ...(raw as Record<string, unknown>) };

  const proof = normalizeOnePerLineList(narrative.proof_points, true);
  if (proof) narrative.proof_points = proof;

  const breakers = normalizeOnePerLineList(narrative.deal_breakers, false);
  if (breakers) narrative.deal_breakers = breakers;

  patch.narrative = narrative;
}

function summarizeUpdatedProfileFields(
  patch: Record<string, unknown>,
): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (
      (k === "candidate" || k === "target_roles" || k === "narrative") &&
      v &&
      typeof v === "object" &&
      !Array.isArray(v)
    ) {
      const nested = Object.keys(v as Record<string, unknown>);
      for (const nk of nested) out.push(`${k}.${nk}`);
      continue;
    }
    out.push(k);
  }
  return [...new Set(out)].sort();
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
2. Populate \`profile_updates\` aggressively when inferable from résumé text and existing profile.
   - Infer likely **field/domain** from experience (examples: data engineering, ML platform, backend, product analytics).
   - Infer role ladder + targeting from recent roles and seniority progression.
   - Fill \`target_roles.primary\`, \`target_roles.secondary\`, and \`target_roles.archetypes\` with concrete role families.
   - Refresh \`narrative.one_liner\` and \`narrative.proof_points\` using resume-backed facts only.
3. Only change \`cover_letter_base_md\` when user notes request cover-letter preference updates.

${notes ? `Additional instructions from the user:\n---\n${notes}\n---\n\n` : ""}Extracted résumé text:\n---\n${clipped}\n---`;
}

export function buildInstructionFromUploadedResumeMarkdown(
  resumeMarkdown: string,
  userNotes?: string,
): string {
  const clipped = resumeMarkdown.slice(0, 80_000);
  const notes = (userNotes ?? "").trim();
  return `The user uploaded a résumé PDF that has already been converted to markdown. Treat this markdown as the primary source of truth.

Your job:
1. Produce a **full replacement** Markdown body for canonical resume markdown.
2. Populate \`profile_updates\` aggressively when inferable from resume markdown and existing profile.
   - Infer likely **field/domain** from experience (examples: data engineering, ML platform, backend, product analytics).
   - Infer role ladder + targeting from recent roles and seniority progression.
   - Fill \`target_roles.primary\`, \`target_roles.secondary\`, and \`target_roles.archetypes\` with concrete role families.
   - Refresh \`narrative.one_liner\` and \`narrative.proof_points\` using resume-backed facts only.
3. Only change \`cover_letter_base_md\` when user notes request cover-letter preference updates.

${notes ? `Additional instructions from the user:\n---\n${notes}\n---\n\n` : ""}Uploaded resume markdown:\n---\n${clipped}\n---`;
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
- If the instruction is **only** about résumé sections (wording, bullets, ordering, typos) and does **not** ask to change targeting, proof points, or cover-letter voice, return \`profile_updates: null\` and \`cover_letter_base_md: null\` unless the résumé text clearly requires a minimal profile fix (e.g. headline spelling matching the CV).
- \`profile_updates\`: JSON-stringified deep-merge patch (top-level profile keys) or null.
  - Use canonical key \`target_roles\` (NOT \`targeting\`/\`targetting\`) with fields like \`primary\`, \`secondary\`, \`archetypes\`.
  - If resume content provides enough evidence, include updates for \`candidate\`, \`target_roles\`, and \`narrative\`.
  - Prefer non-empty \`target_roles.archetypes\` derived from role history and domain.
  - For role targeting, synthesize from what the user has actually done; do not leave targeting blank when strong evidence exists.
- \`cover_letter_base_md\`: full markdown or null.
- \`chat_reply_md\`: concise markdown summary.
- Do not invent achievements/metrics.
- For \`narrative.proof_points\` and \`narrative.deal_breakers\`, return arrays with one atomic point per item (no multi-point comma-packed lines).

JSON shape:
${COACH_JSON_SCHEMA}`;

  const res = await geminiGenerateContent(MODEL, key, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.35, maxOutputTokens: 8192 },
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "resume_coach_result",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            cv_md: { type: ["string", "null"] },
            profile_updates: { type: ["string", "null"] },
            cover_letter_base_md: { type: ["string", "null"] },
            chat_reply_md: { type: "string" },
          },
          required: ["cv_md", "profile_updates", "cover_letter_base_md", "chat_reply_md"],
        },
      },
    },
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
  let profileFieldsUpdated: string[] = [];

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

  const rawProfileUpdates =
    typeof parsed.profile_updates === "string"
      ? (() => {
          try {
            return JSON.parse(parsed.profile_updates) as unknown;
          } catch {
            return null;
          }
        })()
      : parsed.profile_updates;
  const patch = sanitizeProfilePatch(rawProfileUpdates);
  if (patch) {
    await writeProfile(patch as Profile);
    updated.profile = true;
    profileFieldsUpdated = summarizeUpdatedProfileFields(patch);
  }

  const clBase = parsed.cover_letter_base_md;
  if (typeof clBase === "string" && clBase.trim()) {
    await writeProfile({ cover_letter_base_md: clBase } as unknown as Profile);
    updated.coverLetterBase = true;
  }

  return {
    chat_reply_md: chatReply,
    updated,
    profile_fields_updated: profileFieldsUpdated,
  };
}

export async function readCoverLetterVoiceExcerpt(maxChars = 10000): Promise<string> {
  const profile = await readProfile();
  return String((profile as Record<string, unknown>).cover_letter_base_md ?? "").slice(
    0,
    maxChars,
  );
}
