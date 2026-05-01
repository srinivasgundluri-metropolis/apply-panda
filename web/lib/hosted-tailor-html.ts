/**
 * Prompts + parsing for hosted Tailored docs: model emits print-ready HTML that
 * the server turns into **single-page PDFs** (US Letter) when Chromium is available.
 */

function trimContext(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max)}\n\n… [truncated]`;
}

export interface HostedTailorContext {
  company: string;
  role: string;
  cvMarkdown: string;
  profileYaml: string;
  reportExcerpt: string;
  coverLetterVoice: string;
}

const ONE_PAGE_RULE = `**Single printed page (mandatory):** The output MUST fit on **exactly one US Letter (8.5×11 in) page** when printed or rendered to PDF (no second page, no clipped overflow). You must **shorten content** until it fits — never solve overflow by tiny text.

Readability guardrails:
- Résumé body text must be **10.5pt to 11pt** (never below 10.5pt).
- Cover-letter body text must be **11pt**.
- Line-height should stay in **1.15–1.25**.

In embedded CSS include \`@page { size: letter; margin: 1in; }\` and compact but readable spacing.

If content overflows, prune in this order:
1) Remove least-relevant/oldest experience bullets.
2) Reduce bullets to top impact points only.
3) Collapse/trim low-signal skills list items.
4) Keep facts; do not invent or exaggerate.`;

const HTML_RULES = `HTML requirements (all documents):
- Standalone file: <!DOCTYPE html>, <html lang="en">, embedded <style> only (no external CSS/JS/fonts).
- Letter paper, print-friendly black-on-white (no emoji, no remote assets).
- No scripts; no decorative graphics or charts.
- Use semantic markup; keep content honest — only facts from SOURCE_CV and REPORT.
${ONE_PAGE_RULE}
- Match the user's provided template style: clean, text-forward, no decorative elements, no icons.
- Tailoring is mandatory: do not paste SOURCE_CV verbatim. Rewrite and reorder for this specific role/company.
- Use REPORT / JOB CONTEXT as the job target; if REPORT is sparse, infer from role title + company context conservatively.

Cover letters: professional business letter layout; **3 short paragraphs + closing** on one page.

Résumés (ATS + Full — Stanford-style chronological, both still **one page each**):
- **ATS variant:** keyword-rich and dense, but readable (10.5–11pt body).
- **Full variant:** same facts as ATS with slightly more context where space allows; still one page and same font-size floor.
- **Layout:** left-aligned blocks; ~0.45in effective side margins in CSS; reverse chronological order.
- **Typography:** Times New Roman, Times, or Charter for body; simple headings.
- **Header formatting (template-aligned):**
  - Candidate name in H1, centered.
  - Contact line directly below, centered, plain text separators (e.g., \`|\`).
- **Structure (template-aligned):**
  - Optional short **Summary** section (2–3 lines max) if it adds signal.
  - **Experience**: most recent first.
    - Role/company line should mirror template tone: bold either company OR title (not both), location on same line, dates right-aligned.
    - Include 2–4 bullet accomplishments per role when space allows.
  - **Additional Experience** for older/less-relevant roles can be compressed to single-line entries.
  - **Education** after Experience unless SOURCE_CV strongly indicates otherwise.
  - **Skills/Certifications** as compact grouped lines near the end.
- **Content budget (enforce for one-page readability):**
  - Experience entries: target **2–3 most relevant roles** (rarely 4).
  - Bullets per role: **max 2** for ATS, **max 3** for Full.
  - Bullets should be concise (prefer one line; usually <= 22 words).
- **Bullets:** action verbs first; quantify only from SOURCE_CV — never invent metrics.
`;

export function buildHostedAtsHtmlPrompt(ctx: HostedTailorContext): string {
  return `You are tailoring a résumé for a job application (ATS-friendly variant).

${HTML_RULES}

Company: ${ctx.company}
Role: ${ctx.role}

SOURCE_CV (markdown — only use these facts; never invent employers, titles, dates, degrees, or metrics):
---
${trimContext(ctx.cvMarkdown, 14_000)}
---

PROFILE (YAML — targeting, locations, narrative; do not contradict SOURCE_CV):
---
${trimContext(ctx.profileYaml, 6_000)}
---

REPORT / JOB CONTEXT (evaluation excerpt — mirror keywords ethically; do not invent experience):
---
${trimContext(ctx.reportExcerpt, 12_000)}
---

Tailoring rules (strict):
- Re-rank experience bullets by relevance to this role.
- Rewrite bullet wording to align with job requirements/keywords from REPORT.
- Keep facts true but express role-fit explicitly (stack, domain, outcomes).
- Avoid copy/paste bullet sentences from SOURCE_CV.

Output exactly ONE block in this form (nothing before or after the tags):
<<<HOSTED_HTML>>>
<!DOCTYPE html> ... complete **one-page** ATS-style CV: Stanford-style chronological single column, keyword-rich compact bullets, serif CSS per rules above ...
<<<END_HOSTED_HTML>>>`;
}

export function buildHostedFullHtmlPrompt(ctx: HostedTailorContext): string {
  return `You are tailoring a résumé for a job application (full human-readable variant).

${HTML_RULES}

Company: ${ctx.company}
Role: ${ctx.role}

SOURCE_CV (markdown — only use these facts):
---
${trimContext(ctx.cvMarkdown, 14_000)}
---

PROFILE (YAML):
---
${trimContext(ctx.profileYaml, 6_000)}
---

REPORT / JOB CONTEXT:
---
${trimContext(ctx.reportExcerpt, 12_000)}
---

Tailoring rules (strict):
- Re-rank bullets by relevance to this role.
- Rewrite language to show role/company fit while keeping facts unchanged.
- Avoid copy/paste bullet sentences from SOURCE_CV.

Output exactly ONE block:
<<<HOSTED_HTML>>>
<!DOCTYPE html> ... **one-page** Stanford-style résumé: slightly fuller phrasing than ATS but same facts, same one-page density constraint ...
<<<END_HOSTED_HTML>>>`;
}

export function buildHostedCoverHtmlPrompt(ctx: HostedTailorContext): string {
  const voice = ctx.coverLetterVoice.trim()
    ? `\nVOICE / STRUCTURE PREFERENCES:\n${trimContext(ctx.coverLetterVoice, 4000)}\n`
    : "";

  return `You are drafting a **one-page** cover letter as print-ready HTML (server exports PDF).

${HTML_RULES}

Addressed to hiring for: ${ctx.role} at ${ctx.company}

SOURCE_CV (facts only):
---
${trimContext(ctx.cvMarkdown, 10_000)}
---
${voice}
REPORT / JOB CONTEXT:
---
${trimContext(ctx.reportExcerpt, 10_000)}
---

Write 3 short paragraphs plus a brief closing — must stay on **one** printed page.
Make it specific to this job/company (mirror role themes from REPORT), and avoid generic/template phrasing.
Do not invent achievements.

Output exactly ONE block:
<<<HOSTED_HTML>>>
<!DOCTYPE html> ...
<<<END_HOSTED_HTML>>>`;
}

/** Extract first HOSTED_HTML fenced block from model output. */
export function extractHostedHtmlBlock(text: string): string | null {
  const open = "<<<HOSTED_HTML>>>";
  const close = "<<<END_HOSTED_HTML>>>";
  const i = text.indexOf(open);
  if (i === -1) return null;
  const start = i + open.length;
  const j = text.indexOf(close, start);
  const raw = (j === -1 ? text.slice(start) : text.slice(start, j)).trim();
  let html = raw
    .replace(/^\uFEFF/, "")
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const lower = html.toLowerCase();
  const docIdx = lower.indexOf("<!doctype");
  const htmlIdx = lower.search(/<html\b/);
  if (docIdx === -1 && htmlIdx === -1) return null;
  const sliceFrom =
    docIdx !== -1 && (htmlIdx === -1 || docIdx <= htmlIdx) ? docIdx : htmlIdx;
  html = html.slice(sliceFrom).trimStart();

  if (!/^<!DOCTYPE/i.test(html) && !/^<html\b/i.test(html)) return null;
  return html;
}
