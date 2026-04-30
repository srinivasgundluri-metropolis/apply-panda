/**
 * UI-only "derived status" labels. The canonical status (the value stored
 * in `applications.md`) stays exactly what the user / pipeline wrote, but
 * we surface a richer label in the React UI when the row's filesystem
 * artifacts (CV PDF, cover letter PDF) tell us there's something more
 * specific to say. Same logic as Streamlit's `_derive_status_label`.
 */

/**
 * @param hasCvSuite — ATS + Full CV PDFs exist, OR a legacy single-tailored PDF
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
          "Tailored ATS + Full CV suite (or legacy CV), and cover letter, are on disk.",
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
