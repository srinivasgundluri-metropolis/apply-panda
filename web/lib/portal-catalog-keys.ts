import type { PortalsTrackedCompany } from "@/lib/types";
import { DEFAULT_PORTAL_CATALOG } from "@/lib/default-portal-catalog";

/** Stable key for matching catalog rows ↔ saved profile rows. */
export function portalCatalogKey(row: Pick<PortalsTrackedCompany, "careers_url" | "api">): string {
  const raw = (row.careers_url ?? row.api ?? "").trim().toLowerCase();
  return raw.replace(/\/+$/, "");
}

const CATALOG_KEYS = new Set(
  DEFAULT_PORTAL_CATALOG.map((c) => portalCatalogKey(c)),
);

export function isCatalogKey(key: string): boolean {
  return CATALOG_KEYS.has(key);
}

/** Split saved tracked rows into catalog picks vs custom extras (URLs not in bundled list). */
export function partitionTrackedAgainstCatalog(
  tracked: PortalsTrackedCompany[],
): { catalogKeys: Set<string>; extras: PortalsTrackedCompany[] } {
  const catalogKeys = new Set<string>();
  const extras: PortalsTrackedCompany[] = [];
  for (const row of tracked) {
    const k = portalCatalogKey(row);
    if (k && CATALOG_KEYS.has(k)) catalogKeys.add(k);
    else extras.push(row);
  }
  return { catalogKeys, extras };
}

export function trackedCompaniesFromCatalogKeys(keys: Set<string>): PortalsTrackedCompany[] {
  const want = new Set(keys);
  return DEFAULT_PORTAL_CATALOG.filter((c) => want.has(portalCatalogKey(c))).map((c) => ({
    ...c,
  }));
}

/** Dedupe by normalized careers URL / api (extras often overlap catalog). */
export function mergeTrackedDeduped(
  catalogRows: PortalsTrackedCompany[],
  extras: PortalsTrackedCompany[],
): PortalsTrackedCompany[] {
  const seen = new Set<string>();
  const out: PortalsTrackedCompany[] = [];
  for (const row of [...catalogRows, ...extras]) {
    const k = portalCatalogKey(row);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out;
}
