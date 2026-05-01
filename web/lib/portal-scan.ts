/**
 * Shared ATS fetch (Greenhouse, Ashby, Lever, Workday CXS) + portals.yml filters.
 * Used by hosted portal scan (persist) and chat portal search (read-only).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PortalsTrackedCompany, PortalsYamlConfig } from "@/lib/types";
import { defaultCatalogCopy } from "@/lib/default-portal-catalog";

const USER_PORTALS_REQUIRED_MSG =
  "Portal scanner is not configured. Open Profile → ATS boards: add title or location keywords, or paste employer boards (same JSON shape as career-ops portals.yml).";

/** Thrown when `profiles.data.portals` is missing, null, or invalid for scan/search. */
export class UserPortalsConfigMissingError extends Error {
  constructor(message = USER_PORTALS_REQUIRED_MSG) {
    super(message);
    this.name = "UserPortalsConfigMissingError";
  }
}

export type PortalJob = {
  title: string;
  url: string;
  company: string;
  location: string;
  source: string;
};

const FETCH_TIMEOUT_MS = 10_000;

/** Workday allows at most 20 rows per CXS POST; cap pages to keep scans bounded. */
const WORKDAY_PAGE_SIZE = 20;
const WORKDAY_MAX_JOBS_FETCH = 1000;

export type ParsedWorkdayBoard = {
  calypsoOrigin: string;
  tenant: string;
  siteId: string;
};

/**
 * Recognizes `{tenant}.{wd*}myworkdayjobs.com/{siteId}` (optional `locale` prefix before siteId).
 * Returns metadata for CXS `/wday/cxs/{tenant}/{siteId}/jobs` POST fan-out.
 */
export function parseWorkdayCareersUrl(raw: string): ParsedWorkdayBoard | null {
  const s = raw.trim();
  if (!s) return null;
  const urlStr = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const m = host.match(/^([^.]+)\.(wd\d+)\.myworkdayjobs\.com$/);
  if (!m) return null;
  const tenant = m[1];
  const wdCluster = m[2];
  const calypsoOrigin = `${u.protocol}//${tenant}.${wdCluster}.myworkdayjobs.com`;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  let siteId: string;
  const maybeLocale = parts[0];
  if (/^[a-z]{2}-[a-z]{2}$/i.test(maybeLocale) && parts.length >= 2) {
    siteId = parts[1];
  } else {
    siteId = parts[0];
  }
  if (!siteId) return null;
  return { calypsoOrigin, tenant, siteId };
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function postWorkdayJobsPage(
  calypsoOrigin: string,
  tenant: string,
  siteId: string,
  offset: number,
): Promise<{ total?: number; jobPostings?: Array<{ title?: string; externalPath?: string; locationsText?: string }> }> {
  const endpoint = `${calypsoOrigin.replace(/\/$/, "")}/wday/cxs/${encodeURIComponent(tenant)}/${encodeURIComponent(siteId)}/jobs`;
  const body = {
    appliedFacets: {},
    limit: WORKDAY_PAGE_SIZE,
    offset,
    searchText: "",
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Accept-Language": "en-US",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as {
      total?: number;
      jobPostings?: Array<{ title?: string; externalPath?: string; locationsText?: string }>;
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseWorkdayPostingsToJobs(
  postings: NonNullable<Awaited<ReturnType<typeof postWorkdayJobsPage>>["jobPostings"]>,
  companyName: string,
  calypsoOrigin: string,
  siteId: string,
): PortalJob[] {
  const base = calypsoOrigin.replace(/\/$/, "");
  return postings.map((j) => {
    const rawPath = String(j.externalPath ?? "");
    const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
    const url = `${base}/${siteId}${path}`;
    return {
      title: j.title ?? "",
      url,
      company: companyName,
      location: j.locationsText ?? "",
      source: "workday-cxs",
    };
  });
}

async function fetchAllWorkdayJobs(w: ParsedWorkdayBoard, companyName: string): Promise<PortalJob[]> {
  const first = await postWorkdayJobsPage(w.calypsoOrigin, w.tenant, w.siteId, 0);
  const totalReported = typeof first.total === "number" ? first.total : 0;
  const cap = Math.min(totalReported > 0 ? totalReported : WORKDAY_PAGE_SIZE, WORKDAY_MAX_JOBS_FETCH);
  const all = [...(first.jobPostings ?? [])];
  const offsets: number[] = [];
  for (let off = WORKDAY_PAGE_SIZE; off < cap; off += WORKDAY_PAGE_SIZE) {
    offsets.push(off);
  }
  const BATCH = 5;
  for (let i = 0; i < offsets.length; i += BATCH) {
    const slice = offsets.slice(i, i + BATCH);
    const pages = await Promise.all(
      slice.map((off) => postWorkdayJobsPage(w.calypsoOrigin, w.tenant, w.siteId, off)),
    );
    for (const p of pages) {
      all.push(...(p.jobPostings ?? []));
    }
  }
  return parseWorkdayPostingsToJobs(all, companyName, w.calypsoOrigin, w.siteId);
}

export type DetectedPortalApi =
  | { type: "greenhouse"; url: string }
  | { type: "ashby"; url: string }
  | { type: "lever"; url: string }
  | { type: "workday" } & ParsedWorkdayBoard;

export function detectPortalApi(company: { api?: string; careers_url?: string }): DetectedPortalApi | null {
  if (company.api && company.api.includes("greenhouse")) {
    return { type: "greenhouse" as const, url: company.api };
  }
  const url = company.careers_url ?? "";
  const wd = parseWorkdayCareersUrl(url);
  if (wd) {
    return { type: "workday" as const, ...wd };
  }
  const ashby = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
  if (ashby) {
    return {
      type: "ashby" as const,
      url: `https://api.ashbyhq.com/posting-api/job-board/${ashby[1]}?includeCompensation=true`,
    };
  }
  const lever = url.match(/jobs\.lever\.co\/([^/?#]+)/);
  if (lever) {
    return { type: "lever" as const, url: `https://api.lever.co/v0/postings/${lever[1]}` };
  }
  const gh = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/);
  if (gh) {
    return {
      type: "greenhouse" as const,
      url: `https://boards-api.greenhouse.io/v1/boards/${gh[1]}/jobs`,
    };
  }
  return null;
}

function parseGreenhouse(json: unknown, companyName: string): PortalJob[] {
  const jobs =
    (json as { jobs?: Array<{ title?: string; absolute_url?: string; location?: { name?: string } }> })
      .jobs ?? [];
  return jobs.map((j) => ({
    title: j.title ?? "",
    url: j.absolute_url ?? "",
    company: companyName,
    location: j.location?.name ?? "",
    source: "greenhouse-api",
  }));
}

function parseAshby(json: unknown, companyName: string): PortalJob[] {
  const jobs = (json as { jobs?: Array<{ title?: string; jobUrl?: string; location?: string }> }).jobs ?? [];
  return jobs.map((j) => ({
    title: j.title ?? "",
    url: j.jobUrl ?? "",
    company: companyName,
    location: j.location ?? "",
    source: "ashby-api",
  }));
}

function parseLever(json: unknown, companyName: string): PortalJob[] {
  const jobs = Array.isArray(json) ? json : [];
  return jobs.map((j) => ({
    title: String((j as { text?: string }).text ?? ""),
    url: String((j as { hostedUrl?: string }).hostedUrl ?? ""),
    company: companyName,
    location: String((j as { categories?: { location?: string } }).categories?.location ?? ""),
    source: "lever-api",
  }));
}

/** Substring rules: empty `positive` means “allow all”; `negative` always excludes hits. */
export function buildSubstringTextFilter(filter: {
  positive?: string[];
  negative?: string[];
} | undefined) {
  const positive = (filter?.positive ?? []).map((k) => k.toLowerCase());
  const negative = (filter?.negative ?? []).map((k) => k.toLowerCase());
  return (text: string) => {
    const lower = text.toLowerCase();
    const hasPositive = positive.length === 0 || positive.some((k) => lower.includes(k));
    const hasNegative = negative.some((k) => lower.includes(k));
    return hasPositive && !hasNegative;
  };
}

export function buildTitleFilter(titleFilter: { positive?: string[]; negative?: string[] } | undefined) {
  return buildSubstringTextFilter(titleFilter);
}

export function buildLocationFilter(
  locationFilter: { positive?: string[]; negative?: string[] } | undefined,
) {
  return buildSubstringTextFilter(locationFilter);
}

/** User-supplied employers with a fetchable ATS URL still enabled. */
function userListedBoards(tc: PortalsTrackedCompany[] | undefined): PortalsTrackedCompany[] {
  if (!tc?.length) return [];
  return tc.filter(
    (c) =>
      c.enabled !== false &&
      typeof c.careers_url === "string" &&
      c.careers_url.trim().length > 0 &&
      detectPortalApi(c as { careers_url?: string; api?: string }),
  );
}

function positiveLineCount(lines: string[] | undefined): number {
  return (lines ?? []).filter((x) => String(x).trim().length > 0).length;
}

/** True when no user boards are configured (scan will merge the curated default catalog). */
export function portalScanUsesDefaultCatalog(cfg: PortalsYamlConfig): boolean {
  return userListedBoards(cfg.tracked_companies).length === 0;
}

/** Merges curated default boards only when `tracked_companies` is empty or has no callable URLs. */
export function mergeUserPortalsWithDefaultCatalog(cfg: PortalsYamlConfig): PortalsYamlConfig {
  const user = userListedBoards(cfg.tracked_companies);
  if (user.length > 0) return cfg;
  return { ...cfg, tracked_companies: defaultCatalogCopy() };
}

/**
 * When scanning the default employer directory, require title or location narrowing to avoid blind firehose scans.
 */
export function assertNarrowingWhenUsingDefaultCatalog(cfg: PortalsYamlConfig) {
  if (!portalScanUsesDefaultCatalog(cfg)) return;
  const tp = positiveLineCount(cfg.title_filter?.positive);
  const lp = positiveLineCount(cfg.location_filter?.positive);
  if (tp === 0 && lp === 0) {
    throw new UserPortalsConfigMissingError(
      "With no employers listed, add at least one title include phrase or one location hint so the default boards scan stays targeted. Alternatively add specific board URLs.",
    );
  }
}

function isValidUserPortals(p: unknown): p is PortalsYamlConfig {
  if (!p || typeof p !== "object" || Array.isArray(p)) return false;
  const cfg = p as PortalsYamlConfig;
  if (cfg.tracked_companies !== undefined && !Array.isArray(cfg.tracked_companies)) return false;
  if (userListedBoards(cfg.tracked_companies).length > 0) return true;
  const tp = positiveLineCount(cfg.title_filter?.positive);
  const lp = positiveLineCount(cfg.location_filter?.positive);
  return tp > 0 || lp > 0;
}

/**
 * Loads `profiles.data.portals` for the signed-in user (custom boards optional; empty boards need title OR location narrowing).
 */
export async function loadPortalsConfigResolved(
  supabase: SupabaseClient,
  userId: string,
): Promise<PortalsYamlConfig> {
  const { data, error } = await supabase
    .from("profiles")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle<{ data: Record<string, unknown> }>();
  if (error || !data?.data) {
    throw new UserPortalsConfigMissingError();
  }
  const portals = data.data.portals;
  if (portals === null || portals === undefined) {
    throw new UserPortalsConfigMissingError();
  }
  if (!isValidUserPortals(portals)) {
    throw new UserPortalsConfigMissingError(
      "profiles.data.portals must list employers with board URLs or include title/location filter lines. Fix this under Profile → ATS job boards.",
    );
  }
  return portals;
}

function dedupeByUrl(jobs: PortalJob[]): PortalJob[] {
  const seen = new Set<string>();
  const out: PortalJob[] = [];
  for (const j of jobs) {
    const u = j.url.trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(j);
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Optional narrowing: user keywords apply to the **job title only** (the role string).
 * - Tokens must be ≥ 3 chars (avoids bogus "AI" / "ML" substring noise unless spelled out).
 * - **Every** token must match as a whole word in the title (AND), not substring inside company names.
 */
export function applyKeywordNarrowing(jobs: PortalJob[], keywords: string): PortalJob[] {
  const q = keywords.trim().toLowerCase();
  if (!q) return jobs;
  const tokens = q
    .split(/\s+/)
    .map((t) => t.replace(/[^\w.+-]+/g, ""))
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return jobs;
  return jobs.filter((j) =>
    tokens.every((tok) => {
      const re = new RegExp(`\\b${escapeRegExp(tok)}\\b`, "i");
      return re.test(j.title);
    }),
  );
}

export interface CollectPortalJobsOpts {
  companyNameContains?: string | null;
  concurrency?: number;
}

/** All open roles from configured boards after title + optional location substring filters (no DB). */
export async function collectAllTitleFilteredPortalJobs(
  cfg: PortalsYamlConfig,
  options: CollectPortalJobsOpts = {},
): Promise<{ config: PortalsYamlConfig; companiesScanned: number; jobs: PortalJob[] }> {
  assertNarrowingWhenUsingDefaultCatalog(cfg);
  const scanCfg = mergeUserPortalsWithDefaultCatalog(cfg);
  const titleFilter = buildTitleFilter(scanCfg.title_filter);
  const locationFilter = buildLocationFilter(scanCfg.location_filter);
  const companyNeedle = (options.companyNameContains ?? "").trim().toLowerCase();

  const companies = scanCfg.tracked_companies ?? [];
  const targets = companies
    .filter((c) => c.enabled !== false)
    .filter((c) => !companyNeedle || (c.name ?? "").toLowerCase().includes(companyNeedle))
    .map((c) => ({ ...c, _api: detectPortalApi(c) }))
    .filter((c) => c._api !== null);

  const concurrency = Math.max(1, Math.min(12, options.concurrency ?? 8));
  const collected: PortalJob[] = [];

  for (let i = 0; i < targets.length; i += concurrency) {
    const chunk = targets.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (c) => {
        const api = c._api!;
        try {
          let jobs: PortalJob[];
          if (api.type === "workday") {
            jobs = await fetchAllWorkdayJobs(api, c.name ?? "");
          } else {
            const json = await fetchJson(api.url);
            jobs =
              api.type === "greenhouse"
                ? parseGreenhouse(json, c.name ?? "")
                : api.type === "ashby"
                  ? parseAshby(json, c.name ?? "")
                  : parseLever(json, c.name ?? "");
          }
          return jobs.filter(
            (j) =>
              j.url &&
              titleFilter(j.title) &&
              locationFilter(j.location ?? ""),
          );
        } catch {
          return [];
        }
      }),
    );
    for (const arr of chunkResults) collected.push(...arr);
  }

  return { config: scanCfg, companiesScanned: targets.length, jobs: dedupeByUrl(collected) };
}

/** Title filters from yaml, optional chat keywords, capped list for UI. */
export async function searchPortalJobsWithFilters(
  cfg: PortalsYamlConfig,
  keywords: string,
  limit: number,
): Promise<{
  config: PortalsYamlConfig;
  companiesScanned: number;
  jobs: PortalJob[];
  titleFilteredTotal: number;
  keywordMatchedTotal: number;
}> {
  const cap = Math.min(200, Math.max(1, limit));
  const { config, companiesScanned, jobs: all } = await collectAllTitleFilteredPortalJobs(cfg);
  const narrowed = keywords.trim() ? applyKeywordNarrowing(all, keywords) : all;
  return {
    config,
    companiesScanned,
    jobs: narrowed.slice(0, cap),
    titleFilteredTotal: all.length,
    keywordMatchedTotal: narrowed.length,
  };
}