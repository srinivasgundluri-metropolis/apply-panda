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

function buildWhatWhere(cfg: PortalsYamlConfig): { what: string; where: string } {
  const titles = (cfg.title_filter?.positive ?? [])
    .map((s) => String(s).trim())
    .filter(Boolean);
  const locs = (cfg.location_filter?.positive ?? [])
    .map((s) => String(s).trim())
    .filter(Boolean);
  return {
    what: titles.join(" ").trim().slice(0, 200),
    where: locs.join(", ").trim().slice(0, 200),
  };
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

  const { what, where } = buildWhatWhere(cfg);

  const cap = Math.min(100, Math.max(1, maxResults));
  const perPage = Math.min(50, cap);

  /** Adzuna page index is path segment `{page}` starting at 1. */
  const pages = Math.ceil(cap / perPage);
  const out: AdzunaPortalJob[] = [];
  const seenUrl = new Set<string>();

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
      const redirect = String(hit.redirect_url ?? "").trim();
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

      if (!redirect || !title || seenUrl.has(redirect)) continue;
      seenUrl.add(redirect);
      out.push({
        title,
        url: redirect,
        company: company || "Employer",
        location,
        source: "adzuna",
        ...(postedAt !== undefined ? { postedAt } : {}),
      });

      if (out.length >= cap) break;
    }
  }

  return out;
}
