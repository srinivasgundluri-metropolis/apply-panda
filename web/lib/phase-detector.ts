/**
 * Detect the agent's current operational phase from raw stdout. The first
 * matching pattern wins, so put the most specific signals (final "DONE",
 * tracker merge, report write) before generic ones (reading files, search).
 *
 * Mirrors `_PHASE_PATTERNS` in `dashboard/` — both UIs surface the
 * same phase labels so the user has a consistent mental model.
 */

const PATTERNS: Array<{ re: RegExp; phase: string }> = [
  { re: /^\s*DONE:\s/m, phase: "Finalizing" },
  { re: /merge-tracker\.mjs/i, phase: "Updating tracker" },
  { re: /batch\/tracker-additions\//i, phase: "Writing tracker TSV" },
  { re: /reports\/\d{3}-[\w-]+-\d{4}-\d{2}-\d{2}\.md/i, phase: "Writing report" },
  { re: /report\s+saved/i, phase: "Writing report" },
  {
    re: /playwright|browser_navigate|browser_snapshot/i,
    phase: "Verifying posting",
  },
  { re: /web[_ ]?search|web[_ ]?fetch/i, phase: "Researching company / comp" },
  { re: /scrape-linkedin\.mjs/i, phase: "Searching LinkedIn" },
  { re: /add-to-scan\.mjs/i, phase: "Saving to scan list" },
  { re: /generate-pdf\.mjs/i, phase: "Generating PDF" },
  { re: /calling\s+gemini/i, phase: "Calling Gemini API" },
  { re: /loading context/i, phase: "Loading context" },
  {
    re: /modes\/oferta|modes\/_shared|modes\/_profile/i,
    phase: "Reading evaluation rules",
  },
  { re: /\bcv\.md\b|config\/profile\.yml/i, phase: "Reading profile / CV" },
  { re: /^\s*(staged jd|launching|starting)/im, phase: "Starting" },
];

export function detectPhase(line: string, currentPhase: string): string {
  for (const { re, phase } of PATTERNS) {
    if (re.test(line)) return phase;
  }
  return currentPhase;
}
