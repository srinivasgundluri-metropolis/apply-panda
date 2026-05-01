import { REPORTS_DIR, SCAN_HISTORY_PATH } from "./paths";
import type { ApplicationRow } from "./types";
import { deriveStatusLabel } from "./derive-status";
import { apiFileHref } from "./file-serving";
import { createSupabaseServerClient } from "./supabase/server";
import { parseScore } from "./utils";

/**
 * Reads applications.md and returns a parsed + enriched list of rows.
 *
 * Enrichment steps:
 *   1. Score parsed into numeric for sorting.
 *   2. Report path + number extracted from the markdown link cell.
 *   3. URL derived from the report's `**URL:**` header (primary) or from
 *      scan-history.tsv matched by company name (fallback).
 *   4. CV / cover-letter file existence checked under output/.
 *   5. Derived status label ("🎯 Ready to Apply" etc.) computed.
 */
export async function readApplications(
  _candidateSlug?: string,
): Promise<ApplicationRow[]> {
  void _candidateSlug;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []).map((r: Record<string, unknown>) => {
    const score = String(r.score ?? "");
    const status = String(r.status ?? "Evaluated");
    const reportNum = String(r.report_num ?? "");
    const reportPath = String(r.report_path ?? "");
    const report = reportNum && reportPath ? `[${reportNum}](${reportPath})` : "";
    const cvPath = (r.cv_path as string | null) ?? null;
    const clPath = (r.cl_path as string | null) ?? null;
    const cvAtsDocxPath = (r.cv_ats_docx_path as string | null) ?? null;
    const cvFullDocxPath = (r.cv_full_docx_path as string | null) ?? null;
    const clDocxPath = (r.cl_docx_path as string | null) ?? null;
    const hasCvAts = Boolean(r.has_cv_ats);
    const hasCvFull = Boolean(r.has_cv_full);
    const hasCvLegacyOnly = Boolean(r.has_cv_legacy_only);
    const hasCvSuite = hasCvAts && hasCvFull;
    const hasCv = Boolean(cvPath) || hasCvAts || hasCvFull || hasCvLegacyOnly;
    const hasCl = Boolean(clPath);
    const { label: derivedStatus, hint: derivedHint } = deriveStatusLabel(
      status,
      hasCvSuite || hasCvLegacyOnly,
      hasCl,
    );
    return {
      num: String(r.num ?? ""),
      date: String(r.date ?? ""),
      company: String(r.company ?? ""),
      role: String(r.role ?? ""),
      score,
      scoreValue: parseScore(score),
      status,
      pdf: String(r.pdf ?? ""),
      report,
      reportPath,
      reportNum,
      notes: String(r.notes ?? ""),
      url: String(r.source_url ?? ""),
      hasCv,
      hasCvSuite: hasCvSuite || hasCvLegacyOnly,
      hasCvAts,
      hasCvFull,
      hasCvLegacyOnly,
      hasCl,
      cvPath,
      clPath,
      cvDownload: cvPath ? apiFileHref(cvPath) : null,
      cvAtsDownload: (r.cv_ats_path as string | null)
        ? apiFileHref(String(r.cv_ats_path))
        : null,
      cvFullDownload: (r.cv_full_path as string | null)
        ? apiFileHref(String(r.cv_full_path))
        : null,
      cvLegacyDownload: (r.cv_legacy_path as string | null)
        ? apiFileHref(String(r.cv_legacy_path))
        : null,
      cvAtsDocxDownload: cvAtsDocxPath ? apiFileHref(cvAtsDocxPath) : null,
      cvFullDocxDownload: cvFullDocxPath ? apiFileHref(cvFullDocxPath) : null,
      clDownload: clPath ? apiFileHref(clPath) : null,
      clDocxDownload: clDocxPath ? apiFileHref(clDocxPath) : null,
      derivedStatus,
      derivedHint,
    } as ApplicationRow;
  });
  return rows;
}

/**
 * Patches the row matching `num` (the `#` column) and writes the table back.
 * Only `status`, `notes`, and `pdf` are user-editable; the rest of the
 * columns are write-protected because they're managed by the evaluation
 * pipeline and editing them would desync the tracker from `reports/`.
 *
 * Returns true on success, false if the row was not found.
 */
export async function patchApplicationRow(
  num: string,
  patch: { status?: string; notes?: string; pdf?: string },
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const update: Record<string, unknown> = {};
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.pdf !== undefined) update.pdf = patch.pdf;
  if (Object.keys(update).length === 0) return true;
  update.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("applications")
    .update(update)
    .eq("user_id", user.id)
    .eq("num", num)
    .select("id")
    .limit(1);
  if (error) throw error;
  return Boolean(data && data.length > 0);
}

// Re-export to keep imports one-stop for API routes.
export { SCAN_HISTORY_PATH, REPORTS_DIR };
