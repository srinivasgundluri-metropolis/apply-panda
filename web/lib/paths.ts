/**
 * Centralized filesystem path map. Every other lib module imports paths from
 * here so the answer to "where does career-ops live on disk?" lives in one
 * place. The Next.js app is at `<repo>/web/`, so we walk one parent up to
 * find the canonical career-ops root that Streamlit, the .mjs scripts, and
 * the modes/templates files all expect.
 *
 * `REPO_ROOT` auto-detects whether the server cwd is `<repo>/web` or `<repo>`.
 */

import { basename, resolve, join } from "node:path";
import { existsSync } from "node:fs";

function resolveCareerOpsRoot(): string {
  const cwd = process.cwd();
  if (basename(cwd) === "web") {
    return resolve(cwd, "..");
  }
  const markers = [join("config", "profile.yml"), join("data", "applications.md")];
  if (markers.some((m) => existsSync(join(cwd, m)))) {
    return cwd;
  }
  return resolve(cwd, "..");
}

export const REPO_ROOT = resolveCareerOpsRoot();

export const DATA_DIR = resolve(REPO_ROOT, "data");
export const REPORTS_DIR = resolve(REPO_ROOT, "reports");
export const OUTPUT_DIR = resolve(REPO_ROOT, "output");
export const COVER_LETTERS_DIR = resolve(OUTPUT_DIR, "cover-letters");
export const JDS_DIR = resolve(REPO_ROOT, "jds");
export const CONFIG_DIR = resolve(REPO_ROOT, "config");

export const APPLICATIONS_PATH = resolve(DATA_DIR, "applications.md");
export const PIPELINE_PATH = resolve(DATA_DIR, "pipeline.md");
export const SCAN_HISTORY_PATH = resolve(DATA_DIR, "scan-history.tsv");
export const PROFILE_PATH = resolve(CONFIG_DIR, "profile.yml");
/** Optional: candidate-written cover-letter tone, structure, opening/closing preferences (user layer). */
export const COVER_LETTER_BASE_PATH = resolve(CONFIG_DIR, "cover-letter-base.md");
export const CV_PATH = resolve(REPO_ROOT, "cv.md");
export const ENV_PATH = resolve(REPO_ROOT, ".env");
export const STATES_PATH = resolve(REPO_ROOT, "templates", "states.yml");

// Helper scripts the API routes shell out to.
export const SCRIPT_SCRAPE_LINKEDIN = resolve(REPO_ROOT, "scrape-linkedin.mjs");
export const SCRIPT_ADD_TO_SCAN = resolve(REPO_ROOT, "add-to-scan.mjs");
export const SCRIPT_SCAN = resolve(REPO_ROOT, "scan.mjs");
export const SCRIPT_GEMINI_EVAL = resolve(REPO_ROOT, "gemini-eval.mjs");
export const SCRIPT_MERGE_TRACKER = resolve(REPO_ROOT, "merge-tracker.mjs");
