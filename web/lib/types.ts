/**
 * Shared TypeScript types — single source of truth for the shape of every
 * piece of data the UI consumes. Wherever possible, names mirror the column
 * headers in `data/applications.md` and the JSON output of the .mjs helpers
 * so a developer reading both ends of the wire sees the same vocabulary.
 */

export type CanonicalStatus =
  | "Evaluated"
  | "Applied"
  | "Responded"
  | "Interview"
  | "Offer"
  | "Rejected"
  | "Discarded"
  | "SKIP";

export const CANONICAL_STATES: CanonicalStatus[] = [
  "Evaluated",
  "Applied",
  "Responded",
  "Interview",
  "Offer",
  "Rejected",
  "Discarded",
  "SKIP",
];

/** A single row from `data/applications.md`, post-parse + post-enrichment. */
export interface ApplicationRow {
  /** sequential application number, kept as string to preserve leading zeros */
  num: string;
  date: string;
  company: string;
  role: string;
  /** "4.5/5" or empty */
  score: string;
  /** numeric score for sorting; null if unparseable or missing */
  scoreValue: number | null;
  status: string;
  /** "✅" or "❌" or empty */
  pdf: string;
  /** raw report cell from the markdown table, e.g. "[001](reports/001-x-2026-04-28.md)" */
  report: string;
  /** path extracted from the report markdown link, e.g. "reports/001-x-2026-04-28.md" */
  reportPath: string;
  reportNum: string;
  notes: string;
  /** apply URL — derived from the report header or scan-history, never persisted back */
  url: string;
  /**
   * True when at least one tailored CV artifact exists on disk — legacy
   * single PDF counts; pair of ATS + full counts.
   */
  hasCv: boolean;
  /** True when ATS + full variants both exist OR a legacy unnamed PDF exists. */
  hasCvSuite: boolean;
  hasCvAts: boolean;
  hasCvFull: boolean;
  hasCvLegacyOnly: boolean;
  /** UI-only — whether tailored cover letter PDF was found on disk */
  hasCl: boolean;
  /** Relative path — prefer ATS for canonical “CV” chip; see also full/legacy URLs. */
  cvPath: string | null;
  /** Relative path to cover letter PDF (under output/cover-letters/), if found. */
  clPath: string | null;
  /** Primary CV download URL (prefer ATS variant). */
  cvDownload: string | null;
  cvAtsDownload: string | null;
  cvFullDownload: string | null;
  cvLegacyDownload: string | null;
  clDownload: string | null;
  /** UI-only — derived label like "🎯 Ready to Apply" */
  derivedStatus: string;
  derivedHint: string;
}

/** Header metadata extracted from a `reports/NNN-...md` file. */
export interface ReportMeta {
  path: string;
  /** path relative to REPO_ROOT (the form used in markdown links) */
  relPath: string;
  company: string | null;
  role: string | null;
  score: number | null;
  pdfPath: string | null;
  legitimacy: string | null;
  url: string | null;
  /** raw markdown body — set when the caller asks for full content */
  content?: string;
}

/** A row from `data/scan-history.tsv` — one job offer the scanner has seen. */
export interface ScanRow {
  url: string;
  firstSeen: string;
  portal: string;
  title: string;
  company: string;
  status: string;
}

/** Output shape of `node scrape-linkedin.mjs` (only fields we consume). */
export interface LinkedInResult {
  url: string;
  title: string;
  company: string;
  location: string;
  posted: string;
  source?: string;
}

export interface LinkedInResponse {
  total_hits: number;
  query: {
    keywords: string;
    location: string;
    time_range: string;
    remote: boolean;
    limit: number;
  };
  results: LinkedInResult[];
}

/** `POST /api/portals/search` — ATS boards + portals.yml filters. */
export interface PortalSearchResponse {
  query: { keywords: string; limit: number };
  title_filter: { positive: string[]; negative: string[] };
  /** Omitted on older cached client payloads — treat as no location filter */
  location_filter?: { positive: string[]; negative: string[] };
  companies_scanned: number;
  stats: {
    title_filtered_total: number;
    keyword_matched_total: number;
    returned: number;
  };
  results: LinkedInResult[];
}

/** Output shape of `node add-to-scan.mjs --from-stdin`. */
export interface AddToScanResult {
  added: number;
  skipped_duplicates: number;
  total: number;
  also_pipeline?: number;
  added_jobs: Array<{
    url: string;
    company: string;
    title: string;
    portal: string;
  }>;
  error?: string | null;
}

/** Same JSON shape as career-ops `portals.yml`; stored on the signed-in user profile. */
export interface PortalsTrackedCompany {
  name?: string;
  enabled?: boolean;
  api?: string;
  careers_url?: string;
}

export interface PortalsYamlConfig {
  tracked_companies?: PortalsTrackedCompany[];
  title_filter?: { positive?: string[]; negative?: string[] };
  /** Same rules as titles: substring match on the job location string after fetch. */
  location_filter?: { positive?: string[]; negative?: string[] };
}

/** Profile schema — mirrors `config/profile.yml`, all fields optional. */
export interface ProfileCandidate {
  full_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  timezone?: string;
  linkedin?: string;
  github?: string;
  website?: string;
}

export interface ProfileTargetRoles {
  primary?: string[];
  secondary?: string[];
  archetypes?: string[];
}

export interface ProfileNarrative {
  superpower?: string;
  one_liner?: string;
  proof_points?: string[];
  deal_breakers?: string[];
}

export interface ProfileLanguage {
  modes_dir?: string;
}

export interface Profile {
  candidate?: ProfileCandidate;
  target_roles?: ProfileTargetRoles;
  narrative?: ProfileNarrative;
  language?: ProfileLanguage;
  comp_targets?: Record<string, unknown>;
  /** ATS board list for scans and chat search; `null` clears it until you save valid JSON again. */
  portals?: PortalsYamlConfig | null;
  [key: string]: unknown;
}

/** A previous chat-search saved in localStorage / session. */
export interface RecentSearch {
  prompt: string;
  jobs: LinkedInResult[];
  timestamp: string;
  count: number;
}

/** Generic SSE message envelope used by streaming routes. */
export type SseEvent =
  | { type: "stdout"; data: string }
  | { type: "stderr"; data: string }
  | { type: "phase"; data: string }
  | { type: "done"; exitCode: number }
  | { type: "error"; message: string };
