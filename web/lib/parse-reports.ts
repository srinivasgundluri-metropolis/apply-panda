/**
 * Parse evaluation reports under `reports/`. Mirrors the Python
 * `load_report_meta` helper and uses the same regexes so the React UI
 * surfaces exactly the same metadata as Streamlit.
 */

import { readFile, readdir, stat, access } from "node:fs/promises";
import { join, basename, relative } from "node:path";
import { REPO_ROOT, REPORTS_DIR } from "./paths";
import type { ReportMeta } from "./types";

function exists(p: string): Promise<boolean> {
  return access(p).then(
    () => true,
    () => false,
  );
}

const HEADER_RE = /^#\s*Evaluation:\s*(.*?)\s+—\s+(.*)$/m;
const SCORE_RE = /^\*\*Score:\*\*\s*([0-9.]+)\s*\/\s*5/m;
const LEGITIMACY_RE = /^\*\*Legitimacy:\*\*\s*(.+)$/m;
const PDF_RE = /^\*\*PDF:\*\*\s*(.+)$/m;
const URL_RE = /^\*\*URL:\*\*\s*(.+?)\s*$/m;
const MD_LINK_RE = /\[.*?\]\((https?:\/\/[^)]+)\)/;

/**
 * Resolves a path that might be an absolute filesystem path or a path
 * relative to the career-ops repo root (which is how applications.md
 * stores the reference, e.g. `reports/001-foo-2026-04-28.md`).
 */
function resolveReportPath(input: string): string {
  if (!input) return "";
  if (input.startsWith("/")) return input;
  return join(REPO_ROOT, input);
}

export async function parseReportFromPath(
  pathOrRel: string,
  opts: { includeContent?: boolean } = {},
): Promise<ReportMeta | null> {
  const path = resolveReportPath(pathOrRel);
  if (!path || !(await exists(path))) return null;

  const text = await readFile(path, "utf-8");

  let company: string | null = null;
  let role: string | null = null;
  const headerMatch = text.match(HEADER_RE);
  if (headerMatch) {
    company = headerMatch[1].trim();
    role = headerMatch[2].trim();
  }

  let score: number | null = null;
  const scoreMatch = text.match(SCORE_RE);
  if (scoreMatch) {
    const n = parseFloat(scoreMatch[1]);
    score = Number.isFinite(n) ? n : null;
  }

  const legitimacyMatch = text.match(LEGITIMACY_RE);
  const legitimacy = legitimacyMatch ? legitimacyMatch[1].trim() : null;

  let pdfPath: string | null = null;
  const pdfMatch = text.match(PDF_RE);
  if (pdfMatch) {
    const candidate = pdfMatch[1].trim();
    const abs = candidate.startsWith("/") ? candidate : join(REPO_ROOT, candidate);
    if (await exists(abs)) {
      pdfPath = abs;
    }
  }

  let url: string | null = null;
  const urlMatch = text.match(URL_RE);
  if (urlMatch) {
    let candidate = urlMatch[1].trim();
    const linkMatch = candidate.match(MD_LINK_RE);
    if (linkMatch) candidate = linkMatch[1].trim();
    if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
      url = candidate;
    }
  }

  return {
    path,
    relPath: relative(REPO_ROOT, path),
    company,
    role,
    score,
    pdfPath,
    legitimacy,
    url,
    content: opts.includeContent ? text : undefined,
  };
}

/** List all reports, newest first by mtime. */
export async function listReports(): Promise<ReportMeta[]> {
  if (!(await exists(REPORTS_DIR))) return [];
  const entries = await readdir(REPORTS_DIR);
  const files = entries.filter(
    (name) => name.endsWith(".md") && /^\d{3}-/.test(name),
  );
  const stats = await Promise.all(
    files.map(async (name) => ({
      name,
      path: join(REPORTS_DIR, name),
      mtime: (await stat(join(REPORTS_DIR, name))).mtimeMs,
    })),
  );
  stats.sort((a, b) => b.mtime - a.mtime);
  const metas = await Promise.all(
    stats.map((s) => parseReportFromPath(s.path)),
  );
  return metas.filter((m): m is ReportMeta => m !== null);
}

/** Find a report by its 3-digit number prefix (e.g. "001"). */
export async function findReportByNum(
  num: string,
): Promise<ReportMeta | null> {
  if (!(await exists(REPORTS_DIR))) return null;
  const padded = num.padStart(3, "0");
  const entries = await readdir(REPORTS_DIR);
  const match = entries.find(
    (name) => name.endsWith(".md") && name.startsWith(`${padded}-`),
  );
  if (!match) return null;
  return parseReportFromPath(join(REPORTS_DIR, match), {
    includeContent: true,
  });
}

export { basename };
