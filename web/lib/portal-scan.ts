/**
 * Shared ATS fetch (Greenhouse, Ashby, Lever, Workday CXS) + portals.yml filters.
 * Used by hosted portal scan (persist) and chat portal search (read-only).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PortalsYamlConfig } from "@/lib/types";
import { defaultCatalogCopy } from "@/lib/default-portal-catalog";
import {
  fetchAdzunaPortalJobs,
  forceHostedAtsCatalogOnly,
  isAdzunaJobSearchConfigured,
  portalsAdzunaWhatWhere,
} from "@/lib/adzuna-jobs";

const USER_PORTALS_REQUIRED_MSG =
  "Portal scanner is not configured. Open Profile → ATS job targeting: add at least one title phrase or location line.";

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
  /** Best-effort “last updated” or publish time from the ATS (unix ms). Used for sorting. */
  postedAt?: number;
};

/** Hosted scans return at most this many roles, newest ATS timestamps first when available. */
export const HOSTED_SCAN_MATCH_LIMIT = 100;

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

/** Parses common ATS timestamp fields into unix ms when possible (best-effort). */
function postedAtMsFromRecord(j: Record<string, unknown>): number | undefined {
  const bestFromIsoKey = (): number | undefined => {
    let best: number | undefined;
    for (const k of ["updated_at", "created_at", "publishedAt", "published_at", "openedAt", "postedOn", "startDate"]) {
      const v = j[k];
      if (typeof v !== "string" || !v.trim()) continue;
      const t = Date.parse(v);
      if (Number.isFinite(t) && (best === undefined || t > best)) best = t;
    }
    return best;
  };

  let best = bestFromIsoKey();

  for (const k of ["postedOn", "startDate"]) {
    const v = j[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      const ms = v < 2e11 ? Math.round(v * 1000) : Math.round(v);
      if (best === undefined || ms > best) best = ms;
    }
    if (typeof v === "string" && /^\d{10,}$/.test(v.trim())) {
      const n = Number(v);
      const ms = n < 2e11 ? n * 1000 : n;
      if (Number.isFinite(ms) && (best === undefined || ms > best)) best = ms;
    }
  }

  const ua = j.updatedAt;
  if (typeof ua === "number" && Number.isFinite(ua)) {
    const ms = ua < 2e11 ? Math.round(ua * 1000) : Math.round(ua);
    if (best === undefined || ms > best) best = ms;
  } else if (typeof ua === "string" && /^\d+$/.test(ua)) {
    const n = Number(ua);
    const ms = n < 2e11 ? n * 1000 : n;
    if (Number.isFinite(ms) && (best === undefined || ms > best)) best = ms;
  }

  const bul = j.bulletin;
  if (bul && typeof bul === "object" && bul !== null) {
    const plu = (bul as Record<string, unknown>).postingLastUpdated;
    if (typeof plu === "string") {
      const t = Date.parse(plu);
      if (Number.isFinite(t) && (best === undefined || t > best)) best = t;
    }
  }

  return best;
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

type WorkdayJobsPagePayload = {
  total?: number;
  jobPostings?: Array<{
    title?: string;
    externalPath?: string;
    locationsText?: string;
    postedOn?: unknown;
    startDate?: unknown;
    bulletin?: { postingLastUpdated?: unknown };
  }>;
};

async function postWorkdayJobsPage(
  calypsoOrigin: string,
  tenant: string,
  siteId: string,
  offset: number,
): Promise<WorkdayJobsPagePayload> {
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
    return (await res.json()) as WorkdayJobsPagePayload;
  } finally {
    clearTimeout(timer);
  }
}

function parseWorkdayPostingsToJobs(
  postings: NonNullable<WorkdayJobsPagePayload["jobPostings"]>,
  companyName: string,
  calypsoOrigin: string,
  siteId: string,
): PortalJob[] {
  const base = calypsoOrigin.replace(/\/$/, "");
  return postings.map((j) => {
    const rawPath = String(j.externalPath ?? "");
    const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
    const url = `${base}/${siteId}${path}`;
    const rec = j as Record<string, unknown>;
    return {
      title: j.title ?? "",
      url,
      company: companyName,
      location: j.locationsText ?? "",
      source: "workday-cxs",
      postedAt: postedAtMsFromRecord(rec),
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
    (json as {
      jobs?: Array<
        Record<string, unknown> & { title?: string; absolute_url?: string; location?: { name?: string } }
      >;
    }).jobs ?? [];
  return jobs.map((job) => {
    const rec = job as Record<string, unknown>;
    return {
      title: String(rec.title ?? ""),
      url: String(rec.absolute_url ?? ""),
      company: companyName,
      location: String(job.location?.name ?? ""),
      source: "greenhouse-api",
      postedAt: postedAtMsFromRecord(rec),
    };
  });
}

function parseAshby(json: unknown, companyName: string): PortalJob[] {
  const jobs =
    (json as { jobs?: Array<Record<string, unknown> & { title?: string; jobUrl?: string; location?: string }> })
      .jobs ?? [];
  return jobs.map((j) => ({
    title: String(j.title ?? ""),
    url: String(j.jobUrl ?? ""),
    company: companyName,
    location: String(j.location ?? ""),
    source: "ashby-api",
    postedAt: postedAtMsFromRecord(j as Record<string, unknown>),
  }));
}

function parseLever(json: unknown, companyName: string): PortalJob[] {
  const jobs = Array.isArray(json) ? (json as Record<string, unknown>[]) : [];
  return jobs.map((j) => ({
    title: String(j.text ?? ""),
    url: String(j.hostedUrl ?? ""),
    company: companyName,
    location: String((j.categories as { location?: string } | undefined)?.location ?? ""),
    source: "lever-api",
    postedAt: postedAtMsFromRecord(j),
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

function hasPositiveKeywords(filter: { positive?: string[] } | undefined): boolean {
  return (filter?.positive ?? []).some((x) => String(x).trim().length > 0);
}

/**
 * Location filtering in third-party APIs is noisy: many rows have empty or
 * non-standard location strings. When the user sets positive location phrases,
 * keep rows with unknown location instead of dropping everything.
 */
function locationPassWithUnknownAllowed(
  locationText: string,
  locationFilter: { positive?: string[]; negative?: string[] } | undefined,
  checker: (text: string) => boolean,
): boolean {
  const text = locationText.trim();
  if (text) return checker(text);
  return hasPositiveKeywords(locationFilter);
}

function positiveLineCount(lines: string[] | undefined): number {
  return (lines ?? []).filter((x) => String(x).trim().length > 0).length;
}

/**
 * When **not** using Adzuna broad search ({@link hostedScanUsesAdzuna}), hosted scans merge the user’s portals
 * stub with ApplyPanda’s built-in ATS directory ({@link defaultCatalogCopy}).
 * Saved `tracked_companies` on the profile is ignored for fetch volume then; optional `company_filter`
 * still narrows which catalog boards run.
 */
export function mergeUserPortalsWithDefaultCatalog(cfg: PortalsYamlConfig): PortalsYamlConfig {
  return { ...cfg, tracked_companies: defaultCatalogCopy() };
}

/** True when Vercel has Adzuna keys and the deploy is not forced back to the ATS sweep. */
export function hostedScanUsesAdzuna(): boolean {
  return isAdzunaJobSearchConfigured() && !forceHostedAtsCatalogOnly();
}

export function assertHostedScanHasTitleOrLocation(cfg: PortalsYamlConfig) {
  const tp = positiveLineCount(cfg.title_filter?.positive);
  const lp = positiveLineCount(cfg.location_filter?.positive);
  if (tp === 0 && lp === 0) {
    throw new UserPortalsConfigMissingError(
      "Add at least one title phrase or one location line so we can return the newest matching roles.",
    );
  }
}

function toStringList(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);
  }
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function fallbackPortalsFromTargetRoles(
  profileData: Record<string, unknown>,
): PortalsYamlConfig | null {
  const targetRoles =
    profileData.target_roles &&
    typeof profileData.target_roles === "object" &&
    !Array.isArray(profileData.target_roles)
      ? (profileData.target_roles as Record<string, unknown>)
      : null;
  if (!targetRoles) return null;

  const primary = toStringList(targetRoles.primary);
  const secondary = toStringList(targetRoles.secondary);
  const positive = [...new Set([...primary, ...secondary])];
  if (positive.length === 0) return null;

  return {
    tracked_companies: [],
    company_filter: "",
    title_filter: { positive },
  };
}

function isValidUserPortals(p: unknown): p is PortalsYamlConfig {
  if (!p || typeof p !== "object" || Array.isArray(p)) return false;
  const cfg = p as PortalsYamlConfig;
  if (cfg.tracked_companies !== undefined && !Array.isArray(cfg.tracked_companies)) return false;
  if (
    cfg.company_filter !== undefined &&
    (typeof cfg.company_filter !== "string" || cfg.company_filter.length > 200)
  )
    return false;
  const tp = positiveLineCount(cfg.title_filter?.positive);
  const lp = positiveLineCount(cfg.location_filter?.positive);
  return tp > 0 || lp > 0;
}

/**
 * Loads `profiles.data.portals` — title and/or location lines required; tracked boards field is unused for fetch.
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
  const rawProfile = data.data as Record<string, unknown>;
  const portals = rawProfile.portals;
  const fallback = fallbackPortalsFromTargetRoles(rawProfile);
  if (portals === null || portals === undefined) {
    if (fallback) return fallback;
    throw new UserPortalsConfigMissingError();
  }
  if (!isValidUserPortals(portals)) {
    if (fallback) return fallback;
    throw new UserPortalsConfigMissingError(
      "profiles.data.portals must include at least one title phrase or location line (or set target_roles.primary/secondary). Fix this under Profile → ATS job targeting.",
    );
  }
  return portals;
}

/** Newest ATS timestamps first; roles without timestamps sort after dated ones (tie-break: URL desc). */
export function sortHostedScanJobsByRecency(jobs: PortalJob[]): PortalJob[] {
  return [...jobs].sort((a, b) => {
    const ta =
      typeof a.postedAt === "number" && Number.isFinite(a.postedAt) ? a.postedAt : 0;
    const tb =
      typeof b.postedAt === "number" && Number.isFinite(b.postedAt) ? b.postedAt : 0;
    if (tb !== ta) return tb - ta;
    return String(b.url).localeCompare(String(a.url));
  });
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

/** Options derived from `profiles.data.portals` (profile `company_filter` narrows the catalog). */
export function hostedScanCollectOptions(cfg: PortalsYamlConfig): CollectPortalJobsOpts {
  const raw = cfg.company_filter;
  const needle = typeof raw === "string" ? raw.trim() : "";
  return { companyNameContains: needle ? needle : null };
}

/** All open roles from configured boards after title + optional location substring filters (no DB). */
export async function collectAllTitleFilteredPortalJobs(
  cfg: PortalsYamlConfig,
  options: CollectPortalJobsOpts = {},
): Promise<{ config: PortalsYamlConfig; companiesScanned: number; jobs: PortalJob[] }> {
  assertHostedScanHasTitleOrLocation(cfg);

  if (hostedScanUsesAdzuna()) {
    const opts = {
      ...hostedScanCollectOptions(cfg),
      ...options,
    };
    const companyNeedle = (opts.companyNameContains ?? "").trim().toLowerCase();
    const rawJobs = await fetchAdzunaPortalJobs(cfg, HOSTED_SCAN_MATCH_LIMIT);
    const { whatQueries, where } = portalsAdzunaWhatWhere(cfg);
    /**
     * Adzuna already applies `what` / `where`. Re-applying location *positives*
     * client-side often drops every row because ATS snippets omit or abbreviate
     * location vs profile text (e.g. "Chicago IL" vs ""). Only enforce **negatives**
     * here when the query carried that axis; still run full title/location positives
     * when we did not send the corresponding API param.
     */
    const titleNegOnly = buildSubstringTextFilter({
      negative: cfg.title_filter?.negative,
    });
    const locNegOnly = buildSubstringTextFilter({
      negative: cfg.location_filter?.negative,
    });
    let filtered = rawJobs.filter(
      (j) => j.url.trim() && titleNegOnly(j.title) && locNegOnly(j.location ?? ""),
    );
    const hasWhat = whatQueries.some((q) => q.trim().length > 0);
    if (!hasWhat) {
      const titleFilter = buildTitleFilter(cfg.title_filter);
      filtered = filtered.filter((j) => titleFilter(j.title));
    }
    if (!where.trim()) {
      const locationFilter = buildLocationFilter(cfg.location_filter);
      filtered = filtered.filter((j) =>
        locationPassWithUnknownAllowed(
          j.location ?? "",
          cfg.location_filter,
          locationFilter,
        ),
      );
    }
    if (companyNeedle) {
      filtered = filtered.filter((j) =>
        j.company.toLowerCase().includes(companyNeedle),
      );
    }
    return {
      config: cfg,
      companiesScanned: 1,
      jobs: sortHostedScanJobsByRecency(dedupeByUrl(filtered as PortalJob[])),
    };
  }

  const scanCfg = mergeUserPortalsWithDefaultCatalog(cfg);
  const titleFilter = buildTitleFilter(scanCfg.title_filter);
  const locationFilter = buildLocationFilter(scanCfg.location_filter);
  const opts: CollectPortalJobsOpts = {
    ...hostedScanCollectOptions(cfg),
    ...options,
  };
  const companyNeedle = (opts.companyNameContains ?? "").trim().toLowerCase();

  const companies = scanCfg.tracked_companies ?? [];
  const targets = companies
    .filter((c) => c.enabled !== false)
    .filter((c) => !companyNeedle || (c.name ?? "").toLowerCase().includes(companyNeedle))
    .map((c) => ({ ...c, _api: detectPortalApi(c) }))
    .filter((c) => c._api !== null);

  if (targets.length === 0) {
    const rawCf = typeof cfg.company_filter === "string" ? cfg.company_filter.trim() : "";
    throw new UserPortalsConfigMissingError(
      rawCf
        ? `No employer boards matched company filter "${rawCf}". Shorten or clear it under Profile → Scan targeting.`
        : "No fetchable ATS boards resolved (unexpected).",
    );
  }

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
              locationPassWithUnknownAllowed(
                j.location ?? "",
                scanCfg.location_filter,
                locationFilter,
              ),
          );
        } catch {
          return [];
        }
      }),
    );
    for (const arr of chunkResults) collected.push(...arr);
  }

  return {
    config: scanCfg,
    companiesScanned: targets.length,
    jobs: sortHostedScanJobsByRecency(dedupeByUrl(collected)),
  };
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
  const capReq = Math.min(HOSTED_SCAN_MATCH_LIMIT, Math.max(1, limit));
  const { config, companiesScanned, jobs: allSorted } = await collectAllTitleFilteredPortalJobs(cfg);
  const narrowed = keywords.trim() ? applyKeywordNarrowing(allSorted, keywords) : allSorted;
  return {
    config,
    companiesScanned,
    jobs: narrowed.slice(0, capReq),
    titleFilteredTotal: allSorted.length,
    keywordMatchedTotal: narrowed.length,
  };
}