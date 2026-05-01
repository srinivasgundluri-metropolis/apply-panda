#!/usr/bin/env node
/**
 * scrape-linkedin.mjs — LinkedIn Jobs guest-API scraper
 *
 * Hits LinkedIn's public guest endpoint and returns clean JSON. Used by the
 * dashboard chat assistant when the user asks about LinkedIn postings.
 *
 * USAGE
 *   node scrape-linkedin.mjs --keywords "AI Engineer" --location "California"
 *   node scrape-linkedin.mjs --keywords "biotech" --location "Chicago, IL" --time-range week
 *   node scrape-linkedin.mjs --keywords "ML engineer" --remote --time-range 24h --limit 50
 *
 * OPTIONS
 *   --keywords TEXT      Search keywords. At least one of keywords/location is required.
 *   --location TEXT      Location filter (e.g. "California", "Chicago, IL", "Remote").
 *   --limit N            Max results to return (default 25, hard cap 100).
 *   --time-range RANGE   24h | day | today | week | month | any (default `any`).
 *   --remote             Filter to fully-remote roles.
 *   --pretty             Pretty-print the JSON output.
 *   --help               Show this help.
 *
 * OUTPUT
 *   JSON to stdout:
 *   { query: {...}, total: N, results: [
 *       { title, company, location, url, posted_date, posted_relative }, ...
 *   ] }
 *
 * CAVEATS
 *   - LinkedIn rate-limits aggressively. The script throttles 500ms between
 *     pages and bails out on the first non-2xx response.
 *   - The guest endpoint is HTML, not a stable API. Selectors may drift.
 *   - For PERSONAL job-search use only. Respect LinkedIn's Terms of Service.
 */

import { argv, exit, stdout, stderr } from 'process';
import { setTimeout as sleep } from 'timers/promises';

// ── CLI parsing ─────────────────────────────────────────────────────

const args = argv.slice(2);

function getArg(name, def = null) {
  const i = args.indexOf(`--${name}`);
  if (i !== -1 && args[i + 1] !== undefined) return args[i + 1];
  return def;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

if (hasFlag('help') || hasFlag('h') || args.length === 0) {
  console.log(`
LinkedIn Jobs guest-API scraper

Usage:
  node scrape-linkedin.mjs --keywords "AI Engineer" --location "California"
  node scrape-linkedin.mjs --keywords "biotech" --location "Chicago" --time-range week
  node scrape-linkedin.mjs --keywords "ML engineer" --remote --limit 50

Options:
  --keywords TEXT      Search keywords (e.g. "Senior AI Engineer")
  --location TEXT      Location (e.g. "California", "Remote", "Boston, MA")
  --limit N            Max results (default 25, cap 100)
  --time-range RANGE   24h | week | month | any (default any)
  --remote             Only fully-remote roles
  --pretty             Pretty-print JSON
  --help               Show this help

At least one of --keywords or --location is required.
`.trim());
  exit(0);
}

const keywords = getArg('keywords', '') || '';
const location = getArg('location', '') || '';
const limit = Math.max(1, Math.min(100, parseInt(getArg('limit', '25'), 10) || 25));
const timeRangeRaw = (getArg('time-range', 'any') || 'any').toLowerCase();
const remote = hasFlag('remote');
const pretty = hasFlag('pretty');

const TIME_FILTER_MAP = {
  '24h': 'r86400',
  day: 'r86400',
  today: 'r86400',
  week: 'r604800',
  '7d': 'r604800',
  month: 'r2592000',
  '30d': 'r2592000',
  any: '',
  all: '',
  '': '',
};

const fTPR = TIME_FILTER_MAP[timeRangeRaw];
if (fTPR === undefined) {
  stderr.write(
    `Error: unknown --time-range "${timeRangeRaw}". Use one of: 24h, week, month, any.\n`
  );
  exit(1);
}

if (!keywords.trim() && !location.trim()) {
  stderr.write('Error: at least one of --keywords or --location is required.\n');
  exit(1);
}

// ── Fetch + parse ───────────────────────────────────────────────────

const PAGE_SIZE = 25;
const BASE_URL =
  'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchPage(start) {
  const params = new URLSearchParams();
  if (keywords) params.set('keywords', keywords);
  if (location) params.set('location', location);
  if (fTPR) params.set('f_TPR', fTPR);
  if (remote) params.set('f_WT', '2'); // 2 == fully remote
  params.set('start', String(start));

  const url = `${BASE_URL}?${params.toString()}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`LinkedIn returned HTTP ${res.status} for ${url}`);
  }
  return await res.text();
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'");
}

function stripTags(html) {
  return decodeEntities(String(html || '').replace(/<[^>]+>/g, '').trim())
    .replace(/\s+/g, ' ')
    .trim();
}

function pick(re, src) {
  const m = src.match(re);
  return m ? m[1] : '';
}

function canonicalLinkedInJobUrl(rawHref) {
  if (!rawHref) return '';
  let u;
  try {
    u = new URL(rawHref, 'https://www.linkedin.com');
  } catch {
    return '';
  }
  const host = (u.hostname || '').toLowerCase();
  if (!host.endsWith('linkedin.com')) return '';
  const match = u.pathname.match(/\/jobs\/view\/(\d+)/i);
  if (!match) return '';
  return `https://www.linkedin.com/jobs/view/${match[1]}`;
}

function parseCards(html) {
  // Each result is a top-level <li> wrapping a base-card div. The guest
  // endpoint returns a list of these (no surrounding <ul>), so we slice on
  // the <li> boundary directly.
  const out = [];
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/g;
  let m;
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
      // Only keep a URL when we have a real LinkedIn job id.
      url: canonicalLinkedInJobUrl(href),
      posted_date: postedAbs || null,
      posted_relative: postedRel || null,
    });
  }
  return out;
}

// ── Main loop ───────────────────────────────────────────────────────

async function main() {
  const results = [];
  const seenUrls = new Set();
  let start = 0;
  let consecutiveEmpty = 0;

  while (results.length < limit) {
    let html;
    try {
      html = await fetchPage(start);
    } catch (e) {
      stderr.write(`Warning: ${e.message}\n`);
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
      results.push(c);
      added += 1;
      if (results.length >= limit) break;
    }

    if (added === 0) break;
    start += PAGE_SIZE;
    if (results.length < limit) await sleep(500);
  }

  const output = {
    query: {
      keywords,
      location,
      time_range: timeRangeRaw,
      remote,
      limit,
    },
    total: results.length,
    results,
  };

  stdout.write(JSON.stringify(output, null, pretty ? 2 : 0) + '\n');
}

main().catch((err) => {
  stderr.write(`Error: ${err.message}\n`);
  exit(1);
});
