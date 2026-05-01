/**
 * Prompt builders for Gemini-backed React app routes.
 *
 * Three flavors:
 *   - buildChatPrompt: ad-hoc Q&A and LinkedIn search guidance
 *   - buildEvalPrompt: job evaluation guidance
 *   - buildCvPrompt / buildClPrompt: tailored document drafting
 */

interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export function buildChatPrompt(
  userMessage: string,
  history: ChatHistoryItem[],
  candidateFirstName: string,
): string {
  let historyBlock = "";
  if (history.length > 0) {
    const formatted = history
      .map((m) => {
        const role = m.role === "user" ? "User" : "Assistant";
        return `${role}: ${m.content}`;
      })
      .join("\n");
    historyBlock = `\n\nPrevious conversation:\n${formatted}`;
  }
  const you = candidateFirstName || "the user";

  return `You are ${you}'s career-ops assistant inside a Next.js dashboard. Answer their questions concisely in GitHub-flavored markdown.

JOB LISTINGS IN THE DASHBOARD (CHAT):
- **LinkedIn-first mode:** When **LinkedIn search first** is checked, ApplyPanda calls **\`/api/linkedin/search\`** (guest Jobs HTML API, same sourcing idea as \`node scrape-linkedin.mjs\`). Rows are **real** \`linkedin.com/jobs/view/{id}\` URLs—never substitute invented links.
- **ATS / Adzuna scan:** Scanner / Pipeline uses the user profile title & location filters. When Adzuna env credentials are configured on the server, search is broad job-index style; otherwise it sweeps curated Greenhouse/Ashby/Lever public boards — **not** from this chat pane. Mention Pipeline / scan history rather than implying chat runs fetches alone.

LOCAL WORKSPACE (prefer this for "what's in my tracker / scan history" questions):
- \`data/scan-history.tsv\` — every job offer the portal scanner has ever seen (columns include \`company\`, \`title\`, \`url\`, \`portal\`, \`status\`, \`first_seen\`, \`last_seen\`).
- \`data/applications.md\` — the canonical application tracker (markdown table with \`#\`, \`Date\`, \`Company\`, \`Role\`, \`Score\`, \`Status\`, \`PDF\`, \`Report\`, \`Notes\`).
- \`reports/*.md\` — completed evaluation reports (one per evaluated job, with full A–G blocks).
- \`cv.md\`, \`config/profile.yml\`, \`modes/_profile.md\` — ${you}'s CV, profile, and personalized targeting rules.
- \`portals.yml\` — the list of companies / portals the scanner is configured to track.

LIVE TOOLS (legacy / local CLI vs hosted APIs):
1. **LinkedIn Jobs (hosted)** — In chat with **LinkedIn search first**, the server already scraped via \`/api/linkedin/search\`. If the table + jobs appear in-thread, reuse those URLs verbatim. Else you may summarize only what the user pasted—never hallucinate postings.

2. **ATS scans** — Direct the user to **Pipeline → Run scan** (hosted) or local \`scan.mjs\`; chat does **not** run ATS search when LinkedIn-first is discussed.

3. **Local CLI** — \`node scrape-linkedin.mjs\` mirrors the hosted LinkedIn endpoint for workspaces that prefer the CLI. Never fabricate LinkedIn URLs.

4. **WebSearch / WebFetch** — company research when saved data + LinkedIn are insufficient.

5. **Shell** — restricted to:
   - \`node scrape-linkedin.mjs ...\` and \`node add-to-scan.mjs ...\` when relevant in a local workspace.
   - Read-only inspection: \`grep\`, \`rg\`, \`head\`, \`tail\`, \`wc\`, \`cat\`, \`ls\`, \`awk\`/\`sed\` (no \`-i\`).
   Never run anything else. No \`scan.mjs\`, no \`merge-tracker.mjs\`, no \`gemini-eval.mjs\`, no \`generate-pdf.mjs\`, no \`git\`, no \`npm\`, no \`pip\`, no destructive commands.

STRUCTURED OUTPUT — OPTIONAL \`jobs-json\` (plain chat mode only):
If (and only if) the user is in **plain AI chat** and you are listing jobs from a **verified** source you actually used (e.g. they pasted URLs, or you are summarizing URLs they provided), emit a fenced \`\`\`jobs-json\`\`\` block **at the end** so inline 💾 / ⚡ works.

Rules:
- **LinkedIn-first mode** ships rows from the server — do **not** duplicate them with invented \`jobs-json\`.
- If you emit JSON, include only jobs with **verbatim** URLs from the user's context or tooling — never placeholders.
- NEVER fabricate or template URLs (no \`.../jobs/view/1234567890\`).
- Cap the array at 25 items.
- Place the block AT THE END of the message, after the markdown table. No prose after it.
- If the user asks a non-job question or no jobs were found, OMIT the block entirely.

HARD RULES:
- DO NOT write or edit files directly. The only state changes you may make are through \`add-to-scan.mjs\` when explicitly asked for a bulk save.
- If the user asks whether to **regenerate** tailored CV/cover outputs after changing their résumé or profile, say: for each tracker row that is **not** **Applied** and already has tailored files (**one-page PDF** when Chromium works; HTML fallback otherwise in the hosted product), use **Tracker → Tailored documents → Regenerate** so downloads match the updated canon. They can also use **Résumé / profile coach** in Chat to persist edits first.
- DO NOT trigger evaluations, CV/CL generation, applications, or recruiter outreach. The user clicks the inline ⚡ Evaluate button (which the dashboard renders from your jobs-json block) — you do not run any evaluation script yourself.
- If asked "evaluate this LinkedIn job", just emit the jobs-json block and reply: _"Click ⚡ Evaluate next to the row you want — it'll run the full A–G pipeline inline."_

ANSWER STYLE:
- For multi-row results, use a compact markdown table. Keep URLs as bare links, not "click here".
- Sort job listings by recency descending.
- Be concise — under 250 words unless the user asks for detail.
- LinkedIn ToS reminder: this is for ${you}'s personal job search only.${historyBlock}

User: ${userMessage}
`;
}

export function buildEvalPrompt(jdText: string, sourceUrl?: string): string {
  return `You are running the career-ops \`oferta\` evaluation flow on a job description.

Required steps (do them all, in order):
1. Read \`modes/oferta.md\` and follow it exactly.
2. Read \`cv.md\`, \`config/profile.yml\`, \`modes/_profile.md\`, \`modes/_shared.md\`, and \`article-digest.md\` (if present) for context.
3. ${sourceUrl ? `Verify the posting at ${sourceUrl} is still active using Playwright (\`browser_navigate\` + \`browser_snapshot\`). If unavailable, fall back to WebFetch and tag the report with \`**Verification:** unconfirmed (batch mode)\`.` : "Verification step optional — the JD is below."}
4. Compute Blocks A–F + Block G (Posting Legitimacy) per \`modes/oferta.md\`.
5. Pick the next sequential 3-digit number by listing \`reports/\` and adding 1 to the max.
6. Write the report to \`reports/{NNN}-{company-slug}-{YYYY-MM-DD}.md\`. Header MUST include \`**URL:**\` and \`**Legitimacy:**\` lines.
7. Write a single-line TSV file to \`batch/tracker-additions/{NNN}-{company-slug}.tsv\` (9 tab-separated columns per CLAUDE.md).
8. Run \`node merge-tracker.mjs\` to merge the TSV into \`data/applications.md\`.
9. Print "DONE: report saved to reports/{NNN}-{company-slug}-{YYYY-MM-DD}.md" on the last line.

${sourceUrl ? `Source URL: ${sourceUrl}\n` : ""}
Job description:
---
${jdText}
---
`;
}

export type PdfPromptOpts = {
  /** User is regenerating existing PDFs; replace prior artifacts and re-read CV/profile from disk. */
  regenerate?: boolean;
  /** Excerpt from `config/cover-letter-base.md` — keep CV/CL voice aligned when present. */
  coverLetterVoice?: string;
};

function cvRegenerationBlock(isRegen: boolean): string[] {
  if (!isRegen) return [];
  return [
    "",
    "**REGENERATION (overwrite prior artifacts):**",
    "- Treat `cv.md` and `config/profile.yml` at their **latest on-disk revisions** — re-read both before generating.",
    "- Under `output/`, locate existing tailored CV PDFs for this employer (matching `cv-*` + company slug + `*-ats.pdf` / `*-full.pdf`; include legacy `.pdf` variants without `-ats`/`-full` if present). Delete those files **or** overwrite outputs when writing new PDFs — same destination paths are fine.",
    "- Use today’s `{YYYY-MM-DD}` in filenames; do not revert to stale resume content shipped in old PDFs.",
  ];
}

function coverLetterRegenerationBlock(isRegen: boolean): string[] {
  if (!isRegen) return [];
  return [
    "",
    "**REGENERATION:** Re-read fresh `cv.md` and `config/profile.yml`; remove or overwrite prior `output/cover-letters/cover-letter-*` PDFs matching this employer slug.",
  ];
}

export function buildCvPrompt(
  company: string,
  role: string,
  reportRelPath?: string,
  opts?: PdfPromptOpts,
): string {
  const isRegen = Boolean(opts?.regenerate);
  const voice =
    opts?.coverLetterVoice?.trim() &&
    `\n\n**Cover-letter voice (from \`config/cover-letter-base.md\` — align narrative tone if helpful):**\n${opts.coverLetterVoice.trim().slice(0, 6000)}`;

  const lines = [
    `Generate **two** tailored CV PDFs for \`${company}\` — \`${role}\` using the career-ops \`pdf\` mode (see \`modes/pdf.md\`).`,
    ...cvRegenerationBlock(isRegen),
    "",
    "**You must output two distinct HTML files → two PDF runs:**",
    "",
    "1. **ATS-optimized** — compact keyword-dense layout, single-column, short summary, top bullets per role; filename must end with lowercase `-ats.pdf`:",
    "`output/cv-{candidate-slug}-{company-slug}-{YYYY-MM-DD}-ats.pdf`",
    "",
    "2. **Full-length** — include full experience bullets, richer project detail where relevant, fuller narrative:",
    "`output/cv-{candidate-slug}-{company-slug}-{YYYY-MM-DD}-full.pdf`",
    "",
    "Both MUST be generated `generate-pdf.mjs`-compatible HTML (templates/cv-template.html or equivalent) tailored to THIS JD.",
    "",
    "Required steps (do them all, in order):",
    "1. Read `modes/pdf.md` and follow it.",
    "2. Read `cv.md`, `modes/_profile.md`, `config/profile.yml`, and `templates/cv-template.html`.",
  ];
  if (reportRelPath) {
    lines.push(
      `3. Read \`${reportRelPath}\` for JD keywords, archetype, and legitimacy cues — inject keywords ethically (never invent experience).`,
    );
  }
  lines.push(
    "4. For EACH variant write a temp HTML → run `node generate-pdf.mjs <file.html> <output.pdf>` for both paths above (letter/a4 per pdf.md rules).",
    "5. Print one line exactly: `DONE: ats=<path> full=<path>` listing both PDF paths.",
  );
  if (voice) lines.push(voice);
  return lines.join("\n");
}

export function buildCoverLetterPrompt(
  company: string,
  role: string,
  reportRelPath?: string,
  opts?: PdfPromptOpts,
): string {
  const isRegen = Boolean(opts?.regenerate);
  const voiceHint =
    opts?.coverLetterVoice?.trim() &&
    `\n\n**Candidate cover-letter preferences (from \`config/cover-letter-base.md\` — follow structure/tone unless they conflict with honesty):**\n${opts.coverLetterVoice.trim().slice(0, 8000)}`;

  const lines = [
    `Generate a tailored cover letter PDF for \`${company}\` — \`${role}\`.`,
    ...coverLetterRegenerationBlock(isRegen),
    "",
    "Required steps (do them all, in order):",
    "1. Read `cv.md`, `modes/_profile.md`, `config/profile.yml` for tone + proof points.",
  ];
  if (reportRelPath) {
    lines.push(
      `2. Read \`${reportRelPath}\` to lift specific JD keywords + the company's stated values; mirror them naturally in the letter.`,
    );
  }
  lines.push(
    "3. Use the same HTML+CSS conventions as `templates/cv-template.html` for visual consistency.",
    "4. Generate the PDF via `node generate-pdf.mjs` (or the cover-letter-specific generator if present). Save to `output/cover-letters/cover-letter-{candidate-slug}-{company-slug}-{YYYY-MM-DD}.pdf`.",
    "5. Print `DONE: <pdf-path>` on the last line.",
  );
  if (voiceHint) lines.push(voiceHint);
  return lines.join("\n");
}

/** Server-side Gemini prompt — JSON-only output for programmatic parsing. */
export function buildHiringManagerEmailPrompt(opts: {
  company: string;
  role: string;
  candidateFullName: string;
  narrativeOneLiner?: string;
  superpower?: string;
  proofLines?: string;
  reportExcerpt?: string;
  cvExcerpt?: string;
}): string {
  const {
    company,
    role,
    candidateFullName,
    narrativeOneLiner = "",
    superpower = "",
    proofLines = "",
    reportExcerpt = "",
    cvExcerpt = "",
  } = opts;

  return `You draft professional outreach emails for job seekers. Reply in English unless the employer context is clearly non-English.

**Task:** Write ONE formal email someone could send to a hiring manager, talent partner, or recruiting contact at ${company} regarding the ${role} opportunity.

**Candidate name** (must sign exactly with this name): ${candidateFullName}

**From profile (truth — do not invent beyond this):**
- One-line summary: ${narrativeOneLiner || "(not provided)"}
- Differentiator / superpower: ${superpower || "(not provided)"}
- Proof / highlights: ${proofLines || "(not provided)"}

**Evaluation report excerpt** (JD / fit cues — optional):
${reportExcerpt.trim() ? reportExcerpt.slice(0, 14000) : "(none provided)"}

**Résumé excerpt** (experience — truncated; optional):
${cvExcerpt.trim() ? cvExcerpt.slice(0, 10000) : "(none provided)"}

**Style rules:**
- Sound human and composed — not salesy, not "I am passionate about synergies".
- Prefer one clear hook tied to ${company}/${role}, one substantive proof aligned with the excerpts, then a courteous ask (conversation or forwarding).
- Roughly 160–260 words across 2–4 short paragraphs for the email body.
- Do **not** claim credentials, employers, tenure, achievements, metrics, stacks, certifications, sponsorship, or schooling not supported above.
- No phone number in body unless it appears explicitly in excerpts (omit by default).

**Output — CRITICAL — JSON only.** No prose before or after. No markdown fences. Single UTF-8 JSON object:
{"subject":"...","body":"..."}
Escape newlines inside the JSON string values as "\\n". Subject line ≤ 120 characters — specific and professional (no ALL CAPS, no "URGENT").
`;
}
