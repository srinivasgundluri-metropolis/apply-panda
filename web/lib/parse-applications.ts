/**
 * Read + write `data/applications.md` — the canonical applications tracker.
 *
 * The format (defined in the parent project's CLAUDE.md and templates/states.yml):
 *
 *   # Applications Tracker
 *
 *   | # | Date | Company | Role | Score | Status | PDF | Report | Notes |
 *   |---|------|---------|------|-------|--------|-----|--------|-------|
 *   | 1 | 2026-04-28 | UChicago | Research Tech | 4.5/5 | Evaluated | ✅ | [001](reports/...) | ... |
 *
 * IMPORTANT: this module is ONLY allowed to update existing rows. Adding
 * new rows must go through the Python `merge-tracker.mjs` flow because that
 * script handles dedup, sequential numbering, and TSV → MD column mapping.
 * Calling `writeApplications` after appending rows will silently corrupt
 * the order if the markdown table doesn't match merge-tracker's expectation.
 */

import { readFile, writeFile, copyFile, access } from "node:fs/promises";
import { relative } from "node:path";
import { APPLICATIONS_PATH, REPO_ROOT, REPORTS_DIR, SCAN_HISTORY_PATH } from "./paths";
import type { ApplicationRow } from "./types";
import { parseReportFromPath } from "./parse-reports";
import { readScanHistory } from "./scan-history";
import { deriveStatusLabel } from "./derive-status";
import { findExistingDoc, findCvOutputs } from "./find-doc";
import { apiFileHref } from "./file-serving";

function exists(p: string): Promise<boolean> {
  return access(p).then(
    () => true,
    () => false,
  );
}

function parseScore(s: string): number | null {
  if (!s) return null;
  const m = s.match(/^([0-9.]+)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) ? v : null;
}

function extractMdLinkTarget(s: string): string {
  const m = s.match(/\[[^\]]*\]\(([^)]+)\)/);
  return m ? m[1].trim() : "";
}

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
  candidateSlug: string,
): Promise<ApplicationRow[]> {
  if (!(await exists(APPLICATIONS_PATH))) return [];
  const raw = await readFile(APPLICATIONS_PATH, "utf-8");
  const tableLines = raw
    .split(/\r?\n/)
    .filter((ln) => ln.trim().startsWith("|"));

  if (tableLines.length < 2) return [];

  const splitRow = (line: string): string[] =>
    line
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map((c) => c.trim());

  const header = splitRow(tableLines[0]);
  const idx = (col: string) => header.findIndex((h) => h === col);

  const numIdx = idx("#");
  const dateIdx = idx("Date");
  const companyIdx = idx("Company");
  const roleIdx = idx("Role");
  const scoreIdx = idx("Score");
  const statusIdx = idx("Status");
  const pdfIdx = idx("PDF");
  const reportIdx = idx("Report");
  const notesIdx = idx("Notes");

  // Build a company → URL map from scan-history as a fallback for rows that
  // don't yet have a report (e.g. manually added to the tracker).
  const scan = await readScanHistory();
  const scanUrlByCompany = new Map<string, string>();
  for (const row of scan) {
    const key = row.company.trim().toLowerCase();
    if (key && !scanUrlByCompany.has(key)) {
      scanUrlByCompany.set(key, row.url);
    }
  }

  const rows: ApplicationRow[] = [];
  for (const line of tableLines.slice(2)) {
    if (line.includes("---")) continue;
    let parts = splitRow(line);
    if (parts.length < header.length) continue;
    if (parts.length > header.length) {
      // Notes (and sometimes other fields) can contain raw `|` characters.
      // Match the streamlit parser: merge the tail into the last column.
      const tail = parts.slice(header.length - 1).join(" | ").trim();
      parts = [...parts.slice(0, header.length - 1), tail];
    }

    const report = reportIdx >= 0 ? parts[reportIdx] : "";
    const reportPath = extractMdLinkTarget(report);
    const reportNumMatch = report.match(/\[(\d+)\]/);
    const reportNum = reportNumMatch ? reportNumMatch[1] : "";

    const company = companyIdx >= 0 ? parts[companyIdx] : "";
    const role = roleIdx >= 0 ? parts[roleIdx] : "";
    const score = scoreIdx >= 0 ? parts[scoreIdx] : "";
    const status = statusIdx >= 0 ? parts[statusIdx] : "";

    // URL lookup: report header → scan-history fallback.
    let url = "";
    if (reportPath) {
      const meta = await parseReportFromPath(reportPath);
      if (meta?.url) url = meta.url;
    }
    if (!url) {
      url = scanUrlByCompany.get(company.trim().toLowerCase()) ?? "";
    }

    // Tailored doc detection — ATS + Full CV filenames + legacy fallback.
    const cvOut = await findCvOutputs(candidateSlug, company);
    const cvAts = cvOut.atsPath;
    const cvFull = cvOut.fullPath;
    const cvLeg = cvOut.legacyPath;
    const hasCvAts = cvAts !== null;
    const hasCvFull = cvFull !== null;
    const hasCvLegacyOnly = Boolean(cvLeg && !hasCvAts && !hasCvFull);
    const hasCvSuite = Boolean((hasCvAts && hasCvFull) || hasCvLegacyOnly);
    const hasCv =
      hasCvAts || hasCvFull || cvLeg !== null;

    const cl = await findExistingDoc(candidateSlug, company, "cl");
    const hasCl = cl !== null;

    const rel = (abs: string | null) =>
      abs ? relative(REPO_ROOT, abs) : null;
    const cvPath =
      rel(cvAts ?? cvFull ?? cvLeg ?? null);

    const clPath = cl ? relative(REPO_ROOT, cl) : null;
    const { label: derivedStatus, hint: derivedHint } = deriveStatusLabel(
      status,
      hasCvSuite,
      hasCl,
    );

    rows.push({
      num: numIdx >= 0 ? parts[numIdx] : "",
      date: dateIdx >= 0 ? parts[dateIdx] : "",
      company,
      role,
      score,
      scoreValue: parseScore(score),
      status,
      pdf: pdfIdx >= 0 ? parts[pdfIdx] : "",
      report,
      reportPath,
      reportNum,
      notes: notesIdx >= 0 ? parts[notesIdx] : "",
      url,
      hasCv,
      hasCvSuite,
      hasCvAts,
      hasCvFull,
      hasCvLegacyOnly,
      hasCl,
      cvPath,
      clPath,
      cvDownload: cvPath ? apiFileHref(cvPath) : null,
      cvAtsDownload: cvAts ? apiFileHref(relative(REPO_ROOT, cvAts)) : null,
      cvFullDownload: cvFull ? apiFileHref(relative(REPO_ROOT, cvFull)) : null,
      cvLegacyDownload: cvLeg ? apiFileHref(relative(REPO_ROOT, cvLeg)) : null,
      clDownload: clPath ? apiFileHref(clPath) : null,
      derivedStatus,
      derivedHint,
    });
  }

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
  if (!(await exists(APPLICATIONS_PATH))) return false;
  const raw = await readFile(APPLICATIONS_PATH, "utf-8");
  const lines = raw.split(/\r?\n/);

  // Backup once per write — same convention as the Python side.
  const backupPath = `${APPLICATIONS_PATH}.bak`;
  await copyFile(APPLICATIONS_PATH, backupPath).catch(() => {
    /* non-fatal */
  });

  const tableLineIdxs: number[] = [];
  lines.forEach((ln, i) => {
    if (ln.trim().startsWith("|")) tableLineIdxs.push(i);
  });
  if (tableLineIdxs.length < 2) return false;

  const splitRow = (line: string): string[] =>
    line
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map((c) => c.trim());

  const headerLine = lines[tableLineIdxs[0]];
  const header = splitRow(headerLine);
  const numIdx = header.findIndex((h) => h === "#");
  const statusIdx = header.findIndex((h) => h === "Status");
  const notesIdx = header.findIndex((h) => h === "Notes");
  const pdfIdx = header.findIndex((h) => h === "PDF");

  let patched = false;
  for (const lineIdx of tableLineIdxs.slice(2)) {
    const line = lines[lineIdx];
    if (line.includes("---")) continue;
    let parts = splitRow(line);
    if (parts.length < header.length) continue;
    if (parts.length > header.length) {
      const tail = parts.slice(header.length - 1).join(" | ").trim();
      parts = [...parts.slice(0, header.length - 1), tail];
    }

    if (numIdx >= 0 && parts[numIdx] === num) {
      if (patch.status !== undefined && statusIdx >= 0) {
        parts[statusIdx] = patch.status;
      }
      if (patch.notes !== undefined && notesIdx >= 0) {
        parts[notesIdx] = patch.notes;
      }
      if (patch.pdf !== undefined && pdfIdx >= 0) {
        parts[pdfIdx] = patch.pdf;
      }
      lines[lineIdx] = `| ${parts.join(" | ")} |`;
      patched = true;
      break;
    }
  }

  if (!patched) return false;
  await writeFile(APPLICATIONS_PATH, lines.join("\n"), "utf-8");
  return true;
}

// Re-export to keep imports one-stop for API routes.
export { SCAN_HISTORY_PATH, REPORTS_DIR };
