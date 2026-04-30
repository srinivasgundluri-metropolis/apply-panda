import type { ScanRow } from "./types";
import { createSupabaseServerClient } from "./supabase/server";

const HEADER = "url\tfirst_seen\tportal\ttitle\tcompany\tstatus";

export async function readScanHistory(): Promise<ScanRow[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("scan_history")
    .select("url, first_seen, portal, title, company, status")
    .eq("user_id", user.id)
    .order("first_seen", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    url: String(r.url ?? ""),
    firstSeen: String(r.first_seen ?? ""),
    portal: String(r.portal ?? ""),
    title: String(r.title ?? ""),
    company: String(r.company ?? ""),
    status: String(r.status ?? ""),
  }));
}

/**
 * Updates the `status` column for the row matching `url`. Returns true if
 * a row was found and rewritten, false otherwise. Atomic write: the whole
 * file is rewritten in one shot to avoid partial-state corruption.
 */
export async function updateScanStatus(
  url: string,
  newStatus: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from("scan_history")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("url", url.trim())
    .select("id")
    .limit(1);
  if (error) throw error;
  return Boolean(data && data.length > 0);
}

export { HEADER as SCAN_HISTORY_HEADER };
