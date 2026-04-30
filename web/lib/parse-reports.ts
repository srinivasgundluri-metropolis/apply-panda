import { basename } from "node:path";
import { REPORTS_DIR } from "./paths";
import type { ReportMeta } from "./types";
import { createSupabaseServerClient } from "./supabase/server";

export async function parseReportFromPath(
  pathOrRel: string,
  opts: { includeContent?: boolean } = {},
): Promise<ReportMeta | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("user_id", user.id)
    .eq("path", pathOrRel)
    .maybeSingle();
  if (error || !data) return null;
  return {
    path: String(data.path ?? ""),
    relPath: String(data.path ?? ""),
    company: (data.company as string | null) ?? null,
    role: (data.role as string | null) ?? null,
    score: typeof data.score === "number" ? data.score : null,
    pdfPath: (data.pdf_path as string | null) ?? null,
    legitimacy: (data.legitimacy as string | null) ?? null,
    url: (data.url as string | null) ?? null,
    content: opts.includeContent ? String(data.body_md ?? "") : undefined,
  };
}

/** List all reports, newest first by mtime. */
export async function listReports(): Promise<ReportMeta[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    path: String(r.path ?? ""),
    relPath: String(r.path ?? ""),
    company: (r.company as string | null) ?? null,
    role: (r.role as string | null) ?? null,
    score: typeof r.score === "number" ? r.score : null,
    pdfPath: (r.pdf_path as string | null) ?? null,
    legitimacy: (r.legitimacy as string | null) ?? null,
    url: (r.url as string | null) ?? null,
  }));
}

/** Find a report by its 3-digit number prefix (e.g. "001"). */
export async function findReportByNum(
  num: string,
): Promise<ReportMeta | null> {
  const padded = num.padStart(3, "0");
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("user_id", user.id)
    .eq("num", padded)
    .maybeSingle();
  if (error || !data) return null;
  return {
    path: String(data.path ?? `${REPORTS_DIR}/${padded}.md`),
    relPath: String(data.path ?? `${REPORTS_DIR}/${padded}.md`),
    company: (data.company as string | null) ?? null,
    role: (data.role as string | null) ?? null,
    score: typeof data.score === "number" ? data.score : null,
    pdfPath: (data.pdf_path as string | null) ?? null,
    legitimacy: (data.legitimacy as string | null) ?? null,
    url: (data.url as string | null) ?? null,
    content: String(data.body_md ?? ""),
  };
}

export { basename };
