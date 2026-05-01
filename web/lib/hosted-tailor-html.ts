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

const ONE_PAGE_RULE = `**Single printed page (mandatory):** The output MUST fit on **exactly one US Letter (8.5×11 in) page** when printed or rendered to PDF (no second page, no clipped overflow). You must **shorten** content (drop or merge older roles, trim bullets, tighten skills) until it fits — do not assume the engine will auto-shrink. In embedded CSS include \`@page { size: letter; margin: 0.45in; }\` and use compact print styles: body ~9.5–10.5pt for résumés or ~11pt for cover letters, line-height ~1.15–1.25, tight section gaps.`;

const HTML_RULES = `HTML requirements (all documents):
- Standalone file: <!DOCTYPE html>, <html lang="en">, embedded <style> only (no external CSS/JS/fonts).
- Letter paper, print-friendly black-on-white (no emoji, no remote assets).
- No scripts; no decorative graphics or charts.
- Use semantic markup; keep content honest — only facts from SOURCE_CV and REPORT.
${ONE_PAGE_RULE}

Cover letters: professional business letter layout; **3 short paragraphs + closing** on one page.

Résumés (ATS + Full — Stanford-style chronological, both still **one page each**):
- **ATS variant:** keyword-rich, slightly denser spacing; smallest readable body size within the one-page rule.
- **Full variant:** same facts as ATS but slightly more readable phrasing in bullets — still **one page**; do not add enough text to spill to page 2.
- **Layout:** left-aligned blocks; ~0.45in effective side margins in CSS; reverse chronological order.
- **Typography:** Times New Roman, Times, or Charter for body; simple headings.
- **Structure:** CONTACT under H1 (name) → Education (if present) → Experience (most recent first, title | org | dates, tight bullets) → Skills/Projects only if supported by SOURCE_CV.
- **Bullets:** one line when possible; action verbs; quantify only from SOURCE_CV — never invent metrics.
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

Write 3 short paragraphs plus a brief closing — must stay on **one** printed page. Do not invent achievements.

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
