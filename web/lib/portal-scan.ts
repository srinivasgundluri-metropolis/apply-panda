/**
 * Shared Greenhouse / Ashby / Lever fetch + portals.yml title_filter.
 * Used by hosted portal scan (persist) and chat portal search (read-only).
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { REPO_ROOT } from "@/lib/paths";

export type PortalJob = {
  title: string;
  url: string;
  company: string;
  location: string;
  source: string;
};

export type PortalsYamlConfig = {
  tracked_companies?: Array<{ name?: string; enabled?: boolean; api?: string; careers_url?: string }>;
  title_filter?: { positive?: string[]; negative?: string[] };
};

const FETCH_TIMEOUT_MS = 10_000;

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

export function detectPortalApi(company: { api?: string; careers_url?: string }) {
  if (company.api && company.api.includes("greenhouse")) {
    return { type: "greenhouse" as const, url: company.api };
  }
  const url = company.careers_url ?? "";
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

export function buildTitleFilter(titleFilter: { positive?: string[]; negative?: string[] } | undefined) {
  const positive = (titleFilter?.positive ?? []).map((k) => k.toLowerCase());
  const negative = (titleFilter?.negative ?? []).map((k) => k.toLowerCase());
  return (title: string) => {
    const lower = title.toLowerCase();
    const hasPositive = positive.length === 0 || positive.some((k) => lower.includes(k));
    const hasNegative = negative.some((k) => lower.includes(k));
    return hasPositive && !hasNegative;
  };
}

export async function loadPortalsConfig(): Promise<PortalsYamlConfig> {
  const portalsPath = join(REPO_ROOT, "portals.yml");
  const raw = await readFile(portalsPath, "utf-8");
  return parseYaml(raw) as PortalsYamlConfig;
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

/**
 * Optional narrowing: any token (length ≥ 2) must match title, company, or location.
 * Empty / whitespace query → no extra filter.
 */
export function applyKeywordNarrowing(jobs: PortalJob[], keywords: string): PortalJob[] {
  const q = keywords.trim().toLowerCase();
  if (!q) return jobs;
  const tokens = q
    .split(/\s+/)
    .map((t) => t.replace(/[^\w.-]+/g, ""))
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return jobs;
  return jobs.filter((j) => {
    const hay = `${j.title} ${j.company} ${j.location}`.toLowerCase();
    return tokens.some((t) => hay.includes(t));
  });
}

export interface CollectPortalJobsOpts {
  companyNameContains?: string | null;
  concurrency?: number;
}

/** All open roles from configured boards after portals.yml title_filter (no DB). */
export async function collectAllTitleFilteredPortalJobs(
  options: CollectPortalJobsOpts = {},
): Promise<{ config: PortalsYamlConfig; companiesScanned: number; jobs: PortalJob[] }> {
  const cfg = await loadPortalsConfig();
  const titleFilter = buildTitleFilter(cfg.title_filter);
  const companyNeedle = (options.companyNameContains ?? "").trim().toLowerCase();

  const companies = cfg.tracked_companies ?? [];
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
          const json = await fetchJson(api.url);
          const jobs =
            api.type === "greenhouse"
              ? parseGreenhouse(json, c.name ?? "")
              : api.type === "ashby"
                ? parseAshby(json, c.name ?? "")
                : parseLever(json, c.name ?? "");
          return jobs.filter((j) => j.url && titleFilter(j.title));
        } catch {
          return [];
        }
      }),
    );
    for (const arr of chunkResults) collected.push(...arr);
  }

  return { config: cfg, companiesScanned: targets.length, jobs: dedupeByUrl(collected) };
}

/** Title filters from yaml, optional chat keywords, capped list for UI. */
export async function searchPortalJobsWithFilters(
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
  const { config, companiesScanned, jobs: all } = await collectAllTitleFilteredPortalJobs();
  const narrowed = keywords.trim() ? applyKeywordNarrowing(all, keywords) : all;
  return {
    config,
    companiesScanned,
    jobs: narrowed.slice(0, cap),
    titleFilteredTotal: all.length,
    keywordMatchedTotal: narrowed.length,
  };
}
