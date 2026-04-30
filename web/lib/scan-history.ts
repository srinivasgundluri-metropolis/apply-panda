/**
 * Read and update `data/scan-history.tsv`. Header schema (from scan.mjs):
 *
 *   url \t first_seen \t portal \t title \t company \t status
 *
 * Status starts as `added` for new offers. The dashboard transitions it to
 * `Evaluated` after the user runs an evaluation, mirroring the
 * `update_scan_status` helper in streamlit_app.py.
 */

import { readFile, writeFile, access } from "node:fs/promises";
import { SCAN_HISTORY_PATH } from "./paths";
import type { ScanRow } from "./types";

const HEADER = "url\tfirst_seen\tportal\ttitle\tcompany\tstatus";

function exists(p: string): Promise<boolean> {
  return access(p).then(
    () => true,
    () => false,
  );
}

export async function readScanHistory(): Promise<ScanRow[]> {
  if (!(await exists(SCAN_HISTORY_PATH))) return [];
  const raw = await readFile(SCAN_HISTORY_PATH, "utf-8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headerCols = lines[0].split("\t").map((c) => c.trim());
  const idx = (c: string) => headerCols.findIndex((h) => h === c);
  const urlIdx = idx("url");
  const firstSeenIdx = idx("first_seen");
  const portalIdx = idx("portal");
  const titleIdx = idx("title");
  const companyIdx = idx("company");
  const statusIdx = idx("status");

  const rows: ScanRow[] = [];
  for (const line of lines.slice(1)) {
    const parts = line.split("\t");
    rows.push({
      url: parts[urlIdx] ?? "",
      firstSeen: parts[firstSeenIdx] ?? "",
      portal: parts[portalIdx] ?? "",
      title: parts[titleIdx] ?? "",
      company: parts[companyIdx] ?? "",
      status: parts[statusIdx] ?? "",
    });
  }
  return rows;
}

/**
 * Updates the `status` column for the row matching `url`. Returns true if
 * a row was found and rewritten, false otherwise. Atomic write: the whole
 * file is rewritten in one shot to avoid partial-state corruption.
 */
export async function updateScanStatus(
  url: string,
  newStatus: string,
): Promise<boolean> {
  if (!(await exists(SCAN_HISTORY_PATH))) return false;
  const raw = await readFile(SCAN_HISTORY_PATH, "utf-8");
  const lines = raw.split(/\r?\n/);
  if (lines.length < 2) return false;

  const headerCols = lines[0].split("\t").map((c) => c.trim());
  const urlIdx = headerCols.findIndex((c) => c === "url");
  const statusIdx = headerCols.findIndex((c) => c === "status");
  if (urlIdx < 0 || statusIdx < 0) return false;

  let updated = false;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const parts = line.split("\t");
    if ((parts[urlIdx] ?? "").trim() === url.trim()) {
      // Pad parts to header length to avoid `undefined` joins.
      while (parts.length < headerCols.length) parts.push("");
      parts[statusIdx] = newStatus;
      lines[i] = parts.join("\t");
      updated = true;
      break;
    }
  }
  if (!updated) return false;
  await writeFile(SCAN_HISTORY_PATH, lines.join("\n"), "utf-8");
  return true;
}

export { HEADER as SCAN_HISTORY_HEADER };
