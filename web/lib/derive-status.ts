/**
 * UI-only "derived status" labels. The canonical status (the value stored
 * in `applications.md`) stays exactly what the user / pipeline wrote, but
 * we surface a richer label in the React UI when tailored CV / cover-letter
 * artifacts tell us there's something more
 * specific to say. Same logic as the Python dashboard `_derive_status_label`.
 */

/**
 * @param hasCvSuite — ATS + Full tailored CV artifacts exist, OR a legacy single tailored file
 *                    (counts as both for readiness). Cover letter is separate (`hasCl`).
 */
export function deriveStatusLabel(
  canonicalStatus: string,
  hasCvSuite: boolean,
  hasCl: boolean,
): { label: string; hint: string } {
  if (canonicalStatus === "Evaluated") {
    if (hasCvSuite && hasCl) {
      return {
        label: "🎯 Ready to Apply",
        hint:
          "Tailored ATS + Full CV suite (or legacy CV), and cover letter, are saved.",
      };
    }
    if (hasCvSuite || hasCl) {
      return {
        label: "🛠️ Docs Partial",
        hint:
          "Generate ATS + Full tailored CVs and a cover letter (all three outputs) before applying.",
      };
    }
  }
  return { label: canonicalStatus, hint: "" };
}
