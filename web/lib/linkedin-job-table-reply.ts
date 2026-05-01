/**
 * Fixed markdown layout for LinkedIn guest search results (Streamlit-style table).
 * No LLM — used when chat routes job-listing asks to `/api/linkedin/search`.
 */

import type { LinkedInResponse, LinkedInResult } from "@/lib/types";

function escapeTableCell(s: string): string {
  return s.replace(/\|/g, "·").replace(/\n/g, " ").trim();
}

function formatInlineCode(s: string): string {
  const t = s.trim() || "—";
  return `\`${t.replace(/`/g, "'")}\``;
}

export function buildLinkedInSearchTableReply(
  data: LinkedInResponse,
  jobsOverride?: LinkedInResult[],
  filterNote?: string,
): { content: string; jobs: LinkedInResult[] } {
  const q = data.query;
  const remoteNote = q.remote ? "**Remote-only filter:** on.\n\n" : "";
  const lines: string[] = [
    "**LinkedIn Jobs** (guest search — `linkedin.com/jobs/view/…`; personal job search only; respect LinkedIn terms).",
    "",
    remoteNote + "**Query:**",
    `- Keywords: ${formatInlineCode(q.keywords)}`,
    `- Location: ${formatInlineCode(q.location)}`,
    `- Time filter: \`${q.time_range}\` · Limit: ${q.limit}`,
    "",
    `**Rows returned:** ${data.results.length} (guest API may paginate beyond this window).`,
  ];
  const jobs = jobsOverride ?? data.results;
  if (jobs.length === 0) {
    return {
      content:
        lines.join("\n") +
        (filterNote ?? "") +
        "\n\n_No rows._ Try broader keywords, a Profile location for the geo parameter, or a different time window.",
      jobs: [],
    };
  }
  const header =
    "| Company | Title | Location | Posted | URL |\n| --- | --- | --- | --- | --- |";
  const rows = jobs.map(
    (j) =>
      `| ${escapeTableCell(j.company)} | ${escapeTableCell(j.title)} | ${escapeTableCell(j.location)} | ${escapeTableCell(j.posted || "—")} | ${j.url} |`,
  );
  return {
    content: `${lines.join("\n")}${filterNote ?? ""}\n\n${header}\n${rows.join("\n")}`,
    jobs,
  };
}
