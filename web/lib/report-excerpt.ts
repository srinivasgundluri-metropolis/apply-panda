import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Load evaluation report markdown for the signed-in user (hosted Supabase row).
 */
export async function getReportBodyForUser(
  supabase: SupabaseClient,
  userId: string,
  reportNum: string,
): Promise<string | null> {
  const num = reportNum.trim().padStart(3, "0");
  const { data, error } = await supabase
    .from("reports")
    .select("body_md")
    .eq("user_id", userId)
    .eq("num", num)
    .maybeSingle();
  if (error) throw error;
  const md = String((data as { body_md?: string } | null)?.body_md ?? "").trim();
  return md.length ? md : null;
}

export function extractReportNumFromReportPath(path: string): string | null {
  const m = path.trim().match(/(?:^|\/)reports\/(\d{3})-/);
  return m?.[1] ?? null;
}
