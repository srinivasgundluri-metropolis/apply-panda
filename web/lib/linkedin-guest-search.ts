/**
 * LinkedIn Jobs guest HTML feed — same behavior as ../../scrape-linkedin.mjs
 * but runs inside the Next.js server (Vercel-friendly, no subprocess).
 */

import { setTimeout as sleep } from "node:timers/promises";
import type { LinkedInResponse, LinkedInResult } from "@/lib/types";

const PAGE_SIZE = 25;
const BASE_URL = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const TIME_FILTER_MAP: Record<string, string> = {
  "24h": "r86400",
  day: "r86400",
  today: "r86400",
  week: "r604800",
  "7d": "r604800",
  month: "r2592000",
  "30d": "r2592000",
  any: "",
  all: "",
  "": "",
};

export type LinkedInGuestSearchOpts = {
  keywords?: string;
  location?: string;
  limit?: number;
  timeRange?: string;
  remote?: boolean;
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'");
}

function stripTags(html: string): string {
  return decodeEntities(String(html || "").replace(/<[^>]+>/g, "").trim())
    .replace(/\s+/g, " ")
    .trim();
}

function pick(re: RegExp, src: string): string {
  const m = src.match(re);
  return m?.[1] ?? "";
}

function canonicalLinkedInJobUrl(rawHref: string): string {
  if (!rawHref) return "";
  let u: URL;
  try {
    u = new URL(rawHref, "https://www.linkedin.com");
  } catch {
    return "";
  }
  const host = (u.hostname || "").toLowerCase();
  if (!host.endsWith("linkedin.com")) return "";
  const match = u.pathname.match(/\/jobs\/view\/(\d+)/i);
  if (!match) return "";
  return `https://www.linkedin.com/jobs/view/${match[1]}`;
}

function parseCards(html: string): Array<{
  title: string;
  company: string;
  location: string;
  url: string;
  posted_date: string | null;
  posted_relative: string | null;
}> {
  const out: Array<{
    title: string;
    company: string;
    location: string;
    url: string;
    posted_date: string | null;
    posted_relative: string | null;
  }> = [];
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/g;
  let m: RegExpExecArray | null;
  while ((m = liRe.exec(html)) !== null) {
    const card = m[1];
    if (!/base-card/.test(card)) continue;

    const title = pick(
      /class="[^"]*base-search-card__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/,
      card,
    );
    const company = pick(
      /class="[^"]*base-search-card__subtitle[^"]*"[^>]*>([\s\S]*?)<\/h4>/,
      card,
    );
    const loc = pick(
      /class="[^"]*job-search-card__location[^"]*"[^>]*>([\s\S]*?)<\/span>/,
      card,
    );
    const href = pick(
      /class="[^"]*base-card__full-link[^"]*"[^>]+href="([^"]+)"/,
      card,
    );
    const postedAbs = pick(
      /class="[^"]*job-search-card__listdate[^"]*"[^>]+datetime="([^"]+)"/,
      card,
    );
    const postedRel = stripTags(
      pick(
        /class="[^"]*job-search-card__listdate[^"]*"[^>]*>([\s\S]*?)<\/time>/,
        card,
      ),
    );

    if (!title || !company) continue;

    out.push({
      title: stripTags(title),
      company: stripTags(company),
      location: stripTags(loc),
      url: canonicalLinkedInJobUrl(href),
      posted_date: postedAbs || null,
      posted_relative: postedRel || null,
    });
  }
  return out;
}

async function fetchPage(
  keywords: string,
  location: string,
  fTPR: string,
  remote: boolean,
  start: number,
): Promise<string> {
  const params = new URLSearchParams();
  if (keywords) params.set("keywords", keywords);
  if (location) params.set("location", location);
  if (fTPR) params.set("f_TPR", fTPR);
  if (remote) params.set("f_WT", "2");
  params.set("start", String(start));

  const url = `${BASE_URL}?${params.toString()}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`LinkedIn returned HTTP ${res.status}`);
  }
  return await res.text();
}

/** Mirrors `node scrape-linkedin.mjs` JSON shape expected by callers. */
export async function searchLinkedInGuest(opts: LinkedInGuestSearchOpts): Promise<LinkedInResponse> {
  const keywords = (opts.keywords ?? "").trim();
  const location = (opts.location ?? "").trim();
  const limit = Math.max(1, Math.min(100, Number(opts.limit) || 25));
  const timeRangeRaw = (opts.timeRange ?? "any").toLowerCase();
  const remote = Boolean(opts.remote);

  if (!keywords && !location) {
    throw new Error("At least one of keywords or location is required");
  }

  const fTPR = TIME_FILTER_MAP[timeRangeRaw];
  if (fTPR === undefined) {
    throw new Error(`Unknown time range "${timeRangeRaw}". Use 24h, week, month, or any.`);
  }

  const rawResults: Array<{
    title: string;
    company: string;
    location: string;
    url: string;
    posted_date: string | null;
    posted_relative: string | null;
  }> = [];
  const seenUrls = new Set<string>();
  let start = 0;
  let consecutiveEmpty = 0;

  while (rawResults.length < limit) {
    let html: string;
    try {
      html = await fetchPage(keywords, location, fTPR, remote, start);
    } catch (e) {
      if (rawResults.length === 0) throw e;
      break;
    }

    const cards = parseCards(html);
    if (cards.length === 0) {
      consecutiveEmpty += 1;
      if (consecutiveEmpty >= 2) break;
    } else {
      consecutiveEmpty = 0;
    }

    let added = 0;
    for (const c of cards) {
      if (c.url && seenUrls.has(c.url)) continue;
      if (c.url) seenUrls.add(c.url);
      rawResults.push(c);
      added += 1;
      if (rawResults.length >= limit) break;
    }

    if (added === 0) break;
    start += PAGE_SIZE;
    if (rawResults.length < limit) await sleep(500);
  }

  const results: LinkedInResult[] = rawResults.map((c) => ({
    url: c.url,
    title: c.title,
    company: c.company,
    location: c.location,
    posted: c.posted_relative || c.posted_date || "",
    source: "linkedin-guest",
  }));

  return {
    total_hits: results.length,
    query: {
      keywords,
      location,
      time_range: timeRangeRaw,
      remote,
      limit,
    },
    results,
  };
}
