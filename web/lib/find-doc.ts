/**
 * Find an existing tailored CV or cover letter PDF for a (candidate,
 * company) pair. Mirrors the Python `find_existing_doc` fuzzy-matching
 * strategy so the React UI agrees with Streamlit on whether docs exist.
 *
 * Filename conventions written by the modes/pdf flow:
 *   output/cv-{candidate-slug}-{company-slug}-{YYYY-MM-DD}.pdf
 *   output/cover-letters/cover-letter-{candidate-slug}-{company-slug}-{YYYY-MM-DD}.pdf
 *
 * Strict slug matching fails when the company name and the slug used in
 * the file diverge (e.g. "University of Chicago" → "uchicago"). The fuzzy
 * fallback decomposes both slugs into tokens, drops generic stopwords, and
 * checks if any distinctive token is a substring of the other side.
 */

import { readdir, stat, access } from "node:fs/promises";
import { join } from "node:path";
import { OUTPUT_DIR, COVER_LETTERS_DIR } from "./paths";
import { slugify } from "./slugify";
import { classifyCvPdfName, stripCvCompanySlugSegment } from "./cv-names";

type Kind = "cv" | "cl";

const STOPWORDS = new Set([
  "corp",
  "company",
  "the",
  "and",
  "inc",
  "ltd",
  "llc",
  "gmbh",
  "group",
  "co",
  "of",
]);

function dirFor(kind: Kind): string {
  return kind === "cv" ? OUTPUT_DIR : COVER_LETTERS_DIR;
}

function prefixFor(kind: Kind): string {
  return kind === "cv" ? "cv-" : "cover-letter-";
}

function distinctiveTokens(slug: string): string[] {
  return slug
    .split("-")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function fuzzyMatch(canonicalSlug: string, fileSegment: string): boolean {
  if (!canonicalSlug || !fileSegment) return false;
  if (canonicalSlug === fileSegment) return true;
  const a = distinctiveTokens(canonicalSlug);
  const b = fileSegment.toLowerCase();
  // Hit if any distinctive token from the canonical slug appears anywhere
  // in the filename's company segment, or vice versa.
  if (a.some((tok) => b.includes(tok))) return true;
  const fileTokens = distinctiveTokens(fileSegment);
  if (fileTokens.some((tok) => canonicalSlug.includes(tok))) return true;
  return false;
}

async function exists(p: string): Promise<boolean> {
  return access(p).then(
    () => true,
    () => false,
  );
}

/**
 * Returns the absolute path of the most recently modified file matching
 * the (candidate, company, kind) triple, or null if none found.
 */
export async function findExistingDoc(
  candidateSlug: string,
  company: string,
  kind: Kind,
): Promise<string | null> {
  const dir = dirFor(kind);
  if (!(await exists(dir))) return null;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }

  const prefix = prefixFor(kind);
  const companySlug = slugify(company);
  if (!companySlug) return null;

  // Filenames look like:
  //   prefix-{candidateSlug}-{companySlug-or-variant}-{YYYY-MM-DD}.pdf
  // We strictly require the prefix and candidate slug, then pick out the
  // company segment by stripping the date + extension.
  const candidates: Array<{ path: string; mtime: number }> = [];
  for (const name of entries) {
    if (!name.startsWith(`${prefix}${candidateSlug}-`)) continue;
    if (!name.endsWith(".pdf")) continue;
    const inner = name
      .slice((prefix + candidateSlug + "-").length)
      .replace(/\.pdf$/i, "");
    const fileCompanySegment =
      kind === "cv"
        ? stripCvCompanySlugSegment(inner)
        : inner.replace(/-\d{4}-\d{2}-\d{2}$/, "");
    if (!fuzzyMatch(companySlug, fileCompanySegment)) continue;
    const path = join(dir, name);
    try {
      const s = await stat(path);
      candidates.push({ path, mtime: s.mtimeMs });
    } catch {
      // skip unreadable
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0].path;
}

export interface CvPdfOutputs {
  /** Newest `…-ats.pdf` for this company (if any). */
  atsPath: string | null;
  /** Newest `…-full.pdf` for this company (if any). */
  fullPath: string | null;
  /** Newest legacy filename without `-ats`/`-full` (if any). */
  legacyPath: string | null;
}

/**
 * Like `findExistingDoc` for CVs, but classifies ATS vs full-length vs
 * legacy so the UI can show two download buttons and derive status.
 */
export async function findCvOutputs(
  candidateSlug: string,
  company: string,
): Promise<CvPdfOutputs> {
  const dir = OUTPUT_DIR;
  if (!(await exists(dir))) {
    return { atsPath: null, fullPath: null, legacyPath: null };
  }
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return { atsPath: null, fullPath: null, legacyPath: null };
  }

  const prefix = `cv-${candidateSlug}-`;
  const companySlug = slugify(company);
  if (!companySlug) {
    return { atsPath: null, fullPath: null, legacyPath: null };
  }

  const bucket: {
    ats: Array<{ path: string; mtime: number }>;
    full: Array<{ path: string; mtime: number }>;
    legacy: Array<{ path: string; mtime: number }>;
  } = { ats: [], full: [], legacy: [] };

  for (const name of entries) {
    if (!name.startsWith(prefix)) continue;
    if (!name.endsWith(".pdf")) continue;
    const inner = name.slice(prefix.length).replace(/\.pdf$/i, "");
    const fileCompanySegment = stripCvCompanySlugSegment(inner);
    if (!fuzzyMatch(companySlug, fileCompanySegment)) continue;
    const path = join(dir, name);
    let s;
    try {
      s = await stat(path);
    } catch {
      continue;
    }
    const kind = classifyCvPdfName(name.toLowerCase());
    const row = { path, mtime: s.mtimeMs };
    if (kind === "ats") bucket.ats.push(row);
    else if (kind === "full") bucket.full.push(row);
    else bucket.legacy.push(row);
  }

  const newest = (
    rows: Array<{ path: string; mtime: number }>,
  ): string | null => {
    if (rows.length === 0) return null;
    rows.sort((a, b) => b.mtime - a.mtime);
    return rows[0].path;
  };

  return {
    atsPath: newest(bucket.ats),
    fullPath: newest(bucket.full),
    legacyPath: newest(bucket.legacy),
  };
}
