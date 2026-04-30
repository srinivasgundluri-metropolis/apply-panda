import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn-canonical class merger: dedupes Tailwind utilities. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as a compact display string (1.2k, 4.5M). */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toString();
}

/** Format a date or date-string for display ("Apr 28, 2026"). */
export function formatDate(d: string | Date | undefined | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Convert "X.X/5" to a numeric score, or null. */
export function parseScore(s: string | undefined | null): number | null {
  if (!s) return null;
  const m = s.match(/^([0-9.]+)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) ? v : null;
}

/**
 * Parses the 3-digit report prefix from a path like
 * `reports/004-stanford-university-2026-04-28.md` (basename only).
 */
export function extractReportNumFromRelPath(
  relPath: string | null | undefined,
): string | null {
  if (!relPath) return null;
  const name = relPath.replace(/^.*[/\\]/, "");
  const m = name.match(/^(\d{3})-/);
  return m?.[1] ?? null;
}
