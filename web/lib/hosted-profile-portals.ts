/**
 * Normalizes the employer-board portion of career-ops `portals.yml` when stored as
 * `profiles.data.portals` JSON. Positive title/lines for hosted scans come from Profile
 * → Targeting; this payload supplies `tracked_companies`, optional `company_filter`,
 * and optional title/location **negative** lines only.
 */

import type { PortalsTrackedCompany, PortalsYamlConfig } from "@/lib/types";

const MAX_TRACKED_ROWS = 500;

function toTrimmedStrings(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);
  }
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function dedupePreserveOrder(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of lines) {
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function normalizeTrackedCompanyRow(row: unknown): PortalsTrackedCompany | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  const enabled = r.enabled === false ? false : true;
  const careers_url =
    typeof r.careers_url === "string" ? r.careers_url.trim() : undefined;
  const api = typeof r.api === "string" ? r.api.trim() : undefined;
  if (!careers_url && !api) return null;
  return {
    ...(name ? { name } : {}),
    enabled,
    ...(careers_url ? { careers_url } : {}),
    ...(api ? { api } : {}),
  };
}

/** Returns null when there are zero usable tracked company rows after normalization. */
export function normalizeHostedPortalsPayload(raw: unknown): PortalsYamlConfig | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as PortalsYamlConfig & Record<string, unknown>;

  const tcRaw = obj.tracked_companies;
  if (!Array.isArray(tcRaw) || tcRaw.length === 0) return null;

  const tracked: PortalsTrackedCompany[] = [];
  for (const row of tcRaw) {
    const n = normalizeTrackedCompanyRow(row);
    if (n) tracked.push(n);
    if (tracked.length >= MAX_TRACKED_ROWS) break;
  }
  if (tracked.length === 0) return null;

  let company_filter: string | undefined;
  if (typeof obj.company_filter === "string" && obj.company_filter.trim()) {
    const cf = obj.company_filter.trim();
    if (cf.length <= 200) company_filter = cf;
  }

  const titleNeg = dedupePreserveOrder(toTrimmedStrings(obj.title_filter?.negative));
  const locNeg = dedupePreserveOrder(toTrimmedStrings(obj.location_filter?.negative));

  const out: PortalsYamlConfig = { tracked_companies: tracked };
  if (company_filter) out.company_filter = company_filter;
  /** Positives come from Profile → Targeting; store negatives from portals.yml only. */
  if (titleNeg.length) out.title_filter = { negative: titleNeg };
  if (locNeg.length) out.location_filter = { negative: locNeg };

  return out;
}
