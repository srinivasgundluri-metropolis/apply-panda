/**
 * Helpers for tailored CV filenames under `output/`:
 *   cv-{candidate}-{company}-{YYYY-MM-DD}-ats.pdf   — ATS-optimized
 *   cv-{candidate}-{company}-{YYYY-MM-DD}-full.pdf  — full-length
 * Legacy: `cv-{candidate}-{company}-{YYYY-MM-DD}.pdf` (no suffix)
 */

/** Remove trailing `-DATE` plus optional `-ats` / `-full` variant. */
export function stripCvCompanySlugSegment(inner: string): string {
  return inner.replace(
    /-\d{4}-\d{2}-\d{2}(?:-(?:ats|full))?$/i,
    "",
  );
}

export function classifyCvPdfName(nameLower: string): "ats" | "full" | "legacy" {
  if (nameLower.endsWith("-ats.pdf")) return "ats";
  if (nameLower.endsWith("-full.pdf")) return "full";
  return "legacy";
}
