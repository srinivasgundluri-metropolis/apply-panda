/**
 * Slugify identical to the Python helper used by streamlit_app.py and the
 * .mjs scripts (lowercase, drop non-alphanumerics, collapse whitespace,
 * trim/squeeze hyphens). Critical that the two implementations agree —
 * otherwise React will fail to find files written by the Python side.
 */
export function slugify(input: string): string {
  return (input ?? "")
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * "candidate slug" — same convention as the Python `_candidate_slug`. Names
 * are normalized into a single hyphen-joined token, e.g. "Jeevitha Puttaiah"
 * becomes "jeevitha-puttaiah". Empty input falls back to "candidate" so
 * filename matching still works on a freshly-onboarded user.
 */
export function candidateSlug(fullName: string | undefined | null): string {
  const slug = slugify(fullName ?? "");
  return slug || "candidate";
}
