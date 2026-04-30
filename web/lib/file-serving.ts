/**
 * Stable `/api/files/...` URL builder. `path.relative` may produce backslashes
 * on Windows; URLs must always use `/` plus safe per-segment encoding.
 *
 * Files physically live under `output/` (CV / PDF assets) or `reports/`.
 *
 * Canonical short URLs:
 * - `output/cv-x.pdf` → `/api/files/cv-x.pdf`
 * - `output/cover-letters/x.pdf` → `/api/files/cover-letters/x.pdf`
 *
 * Older relative paths (`Output/`, `OUTPUT/cover-letters/`) are normalized
 * so existing on-disk artifacts still resolve.
 */

/**
 * Normalize casing for repo-root-relative paths (`path.relative` on case-
 * insensitive volumes can preserve odd casing — breaks strict `output/` regexes).
 */
function normalizeRepoRelPrefixes(raw: string): string {
  const s = raw.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = s.split("/").filter((seg) => seg !== "" && seg !== "." && seg !== "..");
  if (parts.length === 0) return "";

  const p0 = parts[0];
  const low0 = p0.toLowerCase();

  if (low0 === "output") {
    const rest = parts.slice(1);
    if (
      rest.length >= 1 &&
      rest[0] !== undefined &&
      rest[0].toLowerCase() === "cover-letters"
    ) {
      return ["output", "cover-letters", ...rest.slice(1)].join("/");
    }
    return ["output", ...rest].join("/");
  }
  if (low0 === "reports") {
    return ["reports", ...parts.slice(1)].join("/");
  }
  // `cover-letters/foo.pdf` without leading `output/` (some relative() shapes)
  if (low0 === "cover-letters") {
    return ["cover-letters", ...parts.slice(1)].join("/");
  }
  return parts.join("/");
}

/** Build `/api/files/...` from a path expressed relative to the repo root. */
export function apiFileHref(repoRel: string): string | null {
  const norm = normalizeRepoRelPrefixes(repoRel);

  /** `output/foo.pdf` (no nested dirs under output) → `/api/files/foo.pdf` */
  const topPdf = /^output\/([^/]+\.pdf)$/i.exec(norm);
  if (topPdf) {
    return `/api/files/${encodeURIComponent(topPdf[1])}`;
  }

  /** `output/cover-letters/foo.pdf` → `/api/files/cover-letters/foo.pdf` */
  const cl = /^output\/cover-letters\/(.+)$/i.exec(norm);
  if (cl) {
    const rest = cl[1]
      .split("/")
      .filter((seg) => seg !== "" && seg !== "." && seg !== "..");
    if (rest.length === 0) return null;
    return `/api/files/cover-letters/${rest.map(encodeURIComponent).join("/")}`;
  }

  /** `cover-letters/foo.pdf` at repo-relative root (same target as above) */
  const clBare = /^cover-letters\/(.+)$/i.exec(norm);
  if (clBare) {
    const rest = clBare[1]
      .split("/")
      .filter((seg) => seg !== "" && seg !== "." && seg !== "..");
    if (rest.length === 0) return null;
    return `/api/files/cover-letters/${rest.map(encodeURIComponent).join("/")}`;
  }

  /** `reports/foo.md` */
  if (norm.toLowerCase().startsWith("reports/")) {
    const segments = norm
      .split("/")
      .filter((s) => s !== "" && s !== "." && s !== "..");
    if (segments.length === 0) return null;
    return `/api/files/${segments.map(encodeURIComponent).join("/")}`;
  }

  /* Legacy / odd paths: preserve full segments (includes `output/foo/bar.pdf`) */
  const segments = norm
    .split("/")
    .filter((s) => s !== "" && s !== "." && s !== "..");
  if (segments.length === 0) return null;
  return `/api/files/${segments.map(encodeURIComponent).join("/")}`;
}
