/**
 * Prompts + parsing for hosted Tailored docs: model emits print-ready HTML
 * uploaded to storage as the canonical artifact (use Print → Save as PDF locally if needed).
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

const HTML_RULES = `HTML requirements (both documents):
- Standalone file: <!DOCTYPE html>, <html lang="en">, embedded <style> only (no external CSS/JS/fonts).
- Letter paper, print-friendly black-on-white (no emoji, no remote assets).
- No scripts; no decorative graphics or charts.
- Use semantic markup; keep content honest — only facts from SOURCE_CV and REPORT.

Cover letters: professional business letter proportions (still one column).

Résumés (ATS + Full variants only — follow Stanford Career Education chronological style):
- **Layout conventions** (mirror Stanford sample résumés): margins not below ~1 inch; body text **≥10 pt** (target **11 pt** serif on screen/PDF via CSS); left-aligned blocks; ample white space.
- **Typography** in embedded CSS: serif stack such as Times New Roman, Times, or Charter for body copy; headings may stay bold serif or clean sans accents — keep ATS simplicity (no ornate fonts).
- **Structure**: reverse chronological order. Typical section ordering (adapt titles to SOURCE_CV facts): concise **CONTACT LINE** under an **H1** with your legal name → **Education** (most recent first) → **Experience** / **Professional Experience** (most recent first, title | organization | Location; date range flush right on same conceptual line via flex or aligned spans, then indented bullet lines starting with strong action verbs) → optional splits like Research / Teaching / Volunteering → **Skills** / **Technical Skills** or **Projects** only if supported by SOURCE_CV.
- **Bullets**: one line where possible; lead with verbs; quantify when SOURCE_CV supplies numbers — never invent metrics.
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
<!DOCTYPE html> ... complete ATS-style CV: Stanford-style chronological single column, keyword-rich bullets, serif ~11pt CSS, generous margins (~1 in) ...
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
<!DOCTYPE html> ... Stanford-style chronological résumé: fuller bullets than ATS, serif typography, crisp section headers, reverse-chronological Experience + Education, same facts as ATS ...
<<<END_HOSTED_HTML>>>`;
}

export function buildHostedCoverHtmlPrompt(ctx: HostedTailorContext): string {
  const voice = ctx.coverLetterVoice.trim()
    ? `\nVOICE / STRUCTURE PREFERENCES:\n${trimContext(ctx.coverLetterVoice, 4000)}\n`
    : "";

  return `You are drafting a cover letter as a single print-ready HTML page (user may Print → Save as PDF if needed).

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

Write 3–4 short paragraphs plus a closing line. Do not invent achievements.

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
