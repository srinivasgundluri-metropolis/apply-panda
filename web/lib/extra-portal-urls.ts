import { detectPortalApi } from "@/lib/portal-scan";
import type { PortalsTrackedCompany } from "@/lib/types";

function displayNameFromCareersUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.split("/").filter(Boolean);
    const last = path[path.length - 1] ?? u.hostname.replace(/^www\./, "");
    return last.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Custom board";
  } catch {
    return "Custom board";
  }
}

/** One careers URL per line — keeps rows Greenhouse/Ashby/Lever/Workday-compatible only. */
export function extraBoardsFromUrlLines(text: string): {
  ok: PortalsTrackedCompany[];
  skippedLines: string[];
} {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const ok: PortalsTrackedCompany[] = [];
  const skippedLines: string[] = [];
  for (const line of lines) {
    const api = detectPortalApi({ careers_url: line });
    if (!api) {
      skippedLines.push(line);
      continue;
    }
    ok.push({
      name: displayNameFromCareersUrl(line),
      enabled: true,
      careers_url: line,
    });
  }
  return { ok, skippedLines };
}
