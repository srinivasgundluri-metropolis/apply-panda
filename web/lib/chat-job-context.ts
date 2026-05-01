import type { SupabaseClient } from "@supabase/supabase-js";
import { searchLinkedInGuest } from "@/lib/linkedin-guest-search";
import {
  loadPortalsConfigResolved,
  searchPortalJobsWithFilters,
  UserPortalsConfigMissingError,
  type PortalJob,
} from "@/lib/portal-scan";
import {
  parseJobSearchIntent,
  resolveLiveJobFetchPlan,
  applyPostFilters,
  buildAppliedFilterNote,
  type ParsedJobSearchIntent,
} from "@/lib/job-search-intent";
import type { LinkedInResult } from "@/lib/types";

const PER_SOURCE_LIMIT = 25;
const MERGED_CAP = 40;

function portalJobToLinkedInRow(j: PortalJob): LinkedInResult {
  return {
    url: j.url,
    title: j.title,
    company: j.company,
    location: j.location ?? "",
    posted:
      typeof j.postedAt === "number" && Number.isFinite(j.postedAt)
        ? new Date(j.postedAt).toISOString()
        : "",
    source: j.source || "portal",
  };
}

function dedupeByUrl(jobs: LinkedInResult[]): LinkedInResult[] {
  const seen = new Set<string>();
  const out: LinkedInResult[] = [];
  for (const j of jobs) {
    const key = j.url.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(j);
  }
  return out;
}

function sortJobsByPostedDesc(jobs: LinkedInResult[]): LinkedInResult[] {
  return [...jobs].sort((a, b) => {
    const ta = Date.parse(a.posted || "") || 0;
    const tb = Date.parse(b.posted || "") || 0;
    return tb - ta;
  });
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "·").replace(/\n/g, " ").trim();
}

/** Markdown block appended to chat system prompt — real URLs only, no LLM in fetch path. */
export function formatLiveJobFetchBlock(args: {
  userMessage: string;
  intent: ParsedJobSearchIntent;
  merged: LinkedInResult[];
  li?: { ok: true; keywords: string; count: number } | { ok: false; error: string };
  ats?: { ok: true; companiesScanned: number; count: number } | { ok: false; error: string };
  filterNote: string;
}): string {
  const lines: string[] = [
    "## LIVE JOB FETCH (HTTP only — cite **only** these URLs; never invent postings)",
    "",
    `User ask (verbatim): ${args.userMessage}`,
    "",
    "**Parsed intent:**",
    `- Search keywords/lines sent to connectors: ${args.intent.query || "(fallback: full message)"}`,
    `- LinkedIn time bucket: \`${args.intent.timeRange}\`${args.filterNote}`,
    "",
  ];
  if (args.li) {
    lines.push(
      args.li.ok
        ? `- LinkedIn guest API: fetched ${args.li.count} row(s) · keywords ${args.li.keywords}`
        : `- LinkedIn guest API: failed — ${args.li.error}`,
    );
  }
  if (args.ats) {
    lines.push(
      args.ats.ok
        ? `- ATS boards (profile portals): fetched ${args.ats.count} row(s) from ${args.ats.companiesScanned} board(s)`
        : `- ATS boards: skipped or failed — ${args.ats.error}`,
    );
  }
  lines.push("");
  if (args.merged.length === 0) {
    lines.push("_No postings left after merging sources and applying your wording filters._");
    return lines.join("\n");
  }
  lines.push(`**Merged rows (${args.merged.length}, newest first):**`, "");
  lines.push("| Source | Company | Title | Location | Posted | URL |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const j of args.merged) {
    lines.push(
      `| ${escapeCell(j.source || "—")} | ${escapeCell(j.company)} | ${escapeCell(j.title)} | ${escapeCell(j.location)} | ${escapeCell(j.posted || "—")} | ${j.url} |`,
    );
  }
  return lines.join("\n");
}

/**
 * Loads LinkedIn and/or ATS rows for conversational chat grounding.
 * Mirrors client “search first” fetchers — no LLM here.
 */
export async function gatherLiveJobListingMarkdown(args: {
  message: string;
  locationHint?: string;
  supabase: SupabaseClient;
  userId: string;
}): Promise<string> {
  const intent = parseJobSearchIntent(args.message);
  const plan = resolveLiveJobFetchPlan(intent);
  const filterNote = buildAppliedFilterNote(intent);

  let li:
    | { ok: true; keywords: string; count: number }
    | { ok: false; error: string }
    | undefined;
  let ats:
    | { ok: true; companiesScanned: number; count: number }
    | { ok: false; error: string }
    | undefined;

  const liRows: LinkedInResult[] = [];
  const atsRows: LinkedInResult[] = [];

  if (plan.linkedIn) {
    try {
      const data = await searchLinkedInGuest({
        keywords: intent.query,
        location: args.locationHint,
        limit: PER_SOURCE_LIMIT,
        timeRange: intent.timeRange,
      });
      li = { ok: true, keywords: intent.query, count: data.results.length };
      liRows.push(...data.results);
    } catch (e) {
      li = { ok: false, error: (e as Error).message };
    }
  }

  if (plan.ats) {
    try {
      const cfg = await loadPortalsConfigResolved(args.supabase, args.userId);
      const result = await searchPortalJobsWithFilters(
        cfg,
        intent.query,
        PER_SOURCE_LIMIT,
      );
      ats = {
        ok: true,
        companiesScanned: result.companiesScanned,
        count: result.jobs.length,
      };
      atsRows.push(...result.jobs.map(portalJobToLinkedInRow));
    } catch (e) {
      if (e instanceof UserPortalsConfigMissingError) {
        ats = { ok: false, error: e.message };
      } else {
        ats = { ok: false, error: (e as Error).message };
      }
    }
  }

  const mergedRaw = dedupeByUrl([...liRows, ...atsRows]);
  const filtered = applyPostFilters(mergedRaw, intent);
  const merged = sortJobsByPostedDesc(filtered).slice(0, MERGED_CAP);

  return formatLiveJobFetchBlock({
    userMessage: args.message,
    intent,
    merged,
    li,
    ats,
    filterNote,
  });
}
