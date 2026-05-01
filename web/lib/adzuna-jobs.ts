import type { PortalsYamlConfig } from "@/lib/types";

/**
 * Shape matches {@link PortalJob} in portal-scan.ts (kept separate to avoid cyclic imports).
 */
export type AdzunaPortalJob = {
  title: string;
  url: string;
  company: string;
  location: string;
  source: string;
  postedAt?: number;
};

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isAdzunaLandingUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return (
      /(^|\.)adzuna\./i.test(u.hostname) &&
      /\/land\/ad\//i.test(u.pathname)
    );
  } catch {
    return false;
  }
}

function decodedUrlParamCandidate(raw: string): string | null {
  try {
    const u = new URL(raw);
    const keys = ["url", "dest", "destination", "target", "redirect"];
    for (const k of keys) {
      const v = u.searchParams.get(k);
      if (!v) continue;
      const decoded = decodeURIComponent(v);
      if (isHttpUrl(decoded)) return decoded;
      if (isHttpUrl(v)) return v;
    }
  } catch {
    // noop
  }
  return null;
}

function extractBestJobUrl(hit: Record<string, unknown>): string {
  const rawCandidates = [
    hit.url,
    hit.source_url,
    hit.apply_url,
    hit.target_url,
    hit.redirect_url,
  ]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);

  for (const c of rawCandidates) {
    if (!isHttpUrl(c)) continue;
    if (!isAdzunaLandingUrl(c)) return c;
  }
  for (const c of rawCandidates) {
    if (!isHttpUrl(c)) continue;
    const decoded = decodedUrlParamCandidate(c);
    if (decoded && !isAdzunaLandingUrl(decoded)) return decoded;
  }
  for (const c of rawCandidates) {
    if (isHttpUrl(c)) return c;
  }
  return "";
}

export function isAdzunaJobSearchConfigured(): boolean {
  return Boolean(
    process.env.ADZUNA_APP_ID?.trim() &&
      process.env.ADZUNA_APP_KEY?.trim(),
  );
}

/** When true, use the ATS catalog scan even if Adzuna keys exist (rollback / comparisons). */
export function forceHostedAtsCatalogOnly(): boolean {
  return ["1", "true", "yes"].includes(
    (process.env.APPLYPANDA_USE_ATS_CATALOG ?? "").trim().toLowerCase(),
  );
}

/** Title and location phrases we send as Adzuna `what` / `where`. */
function uniqueNonEmpty(lines: string[]): string[] {
  return [...new Set(lines.map((x) => x.trim()).filter(Boolean))];
}

function normalizeLocationHint(s: string): string {
  return s
    .toLowerCase()
    .replace(/^[,.\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function selectAdzunaWhere(locs: string[]): string {
  if (locs.length === 0) return "";
  const norm = locs.map(normalizeLocationHint).filter(Boolean);
  if (norm.length === 0) return "";
  if (norm.some((x) => x === "united states" || x === "usa" || x === "u.s." || x === "us")) {
    return "United States";
  }
  const meaningful = norm.filter((x) => x.length >= 3 && !/^[a-z]{2}$/.test(x));
  return (meaningful[0] ?? norm[0] ?? "").slice(0, 120);
}

/**
 * Adzuna query builder:
 * - returns title phrases as separate `what` queries (broader, less brittle)
 * - picks a single clean `where` phrase (instead of concatenating many hints)
 */
export function portalsAdzunaWhatWhere(cfg: PortalsYamlConfig): {
  whatQueries: string[];
  where: string;
} {
  const titles = uniqueNonEmpty((cfg.title_filter?.positive ?? []).map(String));
  const locs = uniqueNonEmpty((cfg.location_filter?.positive ?? []).map(String));
  const whatQueries = titles.length
    ? titles.slice(0, 8).map((x) => x.slice(0, 120))
    : [""];
  const where = selectAdzunaWhere(locs);
  return { whatQueries, where };
}

function locationLineFromHit(hit: Record<string, unknown>): string {
  const raw = hit.location;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw && typeof raw === "object" && raw !== null) {
    const o = raw as Record<string, unknown>;
    if (typeof o.display_name === "string" && o.display_name.trim())
      return o.display_name.trim();
    const labels = Array.isArray(o.area) ? (o.area as unknown[]) : [];
    const parts = labels
      .map((x) =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as Record<string, unknown>).name === "string"
          ? String((x as Record<string, unknown>).name)
          : typeof x === "string"
            ? x
            : "",
      )
      .filter(Boolean);
    if (parts.length) return parts.join(", ");
  }

  const flatCandidates = ["city", "county", "area", "location_name"];
  const bits: string[] = [];
  for (const key of flatCandidates) {
    const v = hit[key];
    if (typeof v === "string" && v.trim()) bits.push(v.trim());
  }
  if (bits.length) return [...new Set(bits)].join(", ");
  const area = hit.area;
  if (typeof area === "string" && area.trim()) return area.trim();

  return "";
}

/** Query Adzuna (US by default): any employer titles/locations matching the profile scan lines. Up to {@param maxResults} hits. */
export async function fetchAdzunaPortalJobs(
  cfg: PortalsYamlConfig,
  maxResults: number,
): Promise<AdzunaPortalJob[]> {
  const appId = process.env.ADZUNA_APP_ID!.trim();
  const appKey = process.env.ADZUNA_APP_KEY!.trim();
  const rawCountry =
    (process.env.APPLYPANDA_ADZUNA_COUNTRY ?? "us").trim().toLowerCase() ||
    "us";
  const country = /^[a-z]{2}$/.test(rawCountry) ? rawCountry : "us";

  const { whatQueries, where } = portalsAdzunaWhatWhere(cfg);

  const cap = Math.min(100, Math.max(1, maxResults));
  const perPage = Math.min(50, cap);
  const out: AdzunaPortalJob[] = [];
  const seenUrl = new Set<string>();
  const queryCount = Math.max(1, whatQueries.length);
  const perQueryCap = Math.max(15, Math.ceil(cap / queryCount) + 8);

  for (const what of whatQueries) {
    if (out.length >= cap) break;
    const queryBudget = Math.min(perQueryCap, cap - out.length);
    const pages = Math.ceil(queryBudget / perPage);

    for (let p = 1; p <= pages && out.length < cap; p++) {
      const q = new URLSearchParams({
        app_id: appId,
        app_key: appKey,
        results_per_page: String(Math.min(perPage, cap - out.length)),
      });
      if (what) q.set("what", what);
      if (where) q.set("where", where);

      const url = `https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(country)}/search/${p}?${q.toString()}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      let json: unknown;
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Adzuna HTTP ${res.status}: ${text.slice(0, 300)}`);
        }
        json = await res.json();
      } finally {
        clearTimeout(timer);
      }

      const hits = json as Record<string, unknown>;
      const results = Array.isArray(hits.results)
        ? (hits.results as Record<string, unknown>[])
        : [];

      if (results.length === 0) break;

      for (const hit of results) {
        const title = String(hit.title ?? "").trim();
        const bestUrl = extractBestJobUrl(hit);
        const compRaw = hit.company;
        let company =
          compRaw &&
          typeof compRaw === "object" &&
          typeof (compRaw as Record<string, unknown>).display_name === "string"
            ? String((compRaw as Record<string, unknown>).display_name).trim()
            : "";
        if (!company) company = String(hit.company_name ?? "").trim();
        const location = locationLineFromHit(hit);
        const createdRaw = hit.created;
        let postedAt: number | undefined;
        if (typeof createdRaw === "string") {
          const t = Date.parse(createdRaw);
          if (Number.isFinite(t)) postedAt = t;
        }

        if (!bestUrl || !title || seenUrl.has(bestUrl)) continue;
        seenUrl.add(bestUrl);
        out.push({
          title,
          url: bestUrl,
          company: company || "Employer",
          location,
          source: "adzuna",
          ...(postedAt !== undefined ? { postedAt } : {}),
        });

        if (out.length >= cap) break;
      }
    }
  }

  return out;
}
