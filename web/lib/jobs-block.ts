/**
 * Extract the `jobs-json` sidecar block the chat agent emits alongside any
 * LinkedIn results table. Mirrors the Python `_extract_jobs_block` helper
 * in streamlit_app.py — both UIs detect the same block format so the agent
 * prompt only needs one specification.
 */

import type { LinkedInResult } from "./types";

const JOBS_BLOCK_RE = /```jobs[-_]?json\s*\n([\s\S]*?)\n```/i;

export interface JobsBlockResult {
  /** Original content with the block removed. */
  cleaned: string;
  /** Parsed jobs, or null if no valid block was found. */
  jobs: LinkedInResult[] | null;
}

export function extractJobsBlock(content: string): JobsBlockResult {
  const match = content.match(JOBS_BLOCK_RE);
  if (!match) return { cleaned: content, jobs: null };

  const raw = match[1].trim();
  const cleaned = content.replace(JOBS_BLOCK_RE, "").trimEnd();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { cleaned, jobs: null };
  }
  if (!Array.isArray(parsed)) return { cleaned, jobs: null };

  const jobs: LinkedInResult[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const url = String(rec.url ?? "").trim();
    const company = String(rec.company ?? "").trim();
    const title = String(rec.title ?? "").trim();
    if (!url || !company || !title) continue;
    jobs.push({
      url,
      company,
      title,
      location: String(rec.location ?? "").trim(),
      posted: String(rec.posted ?? "").trim(),
    });
  }

  return { cleaned, jobs: jobs.length > 0 ? jobs : null };
}
