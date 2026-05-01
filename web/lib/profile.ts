/**
 * User profile read/write backed by Supabase (`profiles` table).
 * Column contract:
 *   profiles.user_id (PK, uuid) | profiles.data (jsonb)
 */

import { createSupabaseServerClient, UnauthorizedError } from "./supabase/server";
import type { Profile } from "./types";

export async function readProfile(): Promise<Profile> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) return {};
    const { data } = await supabase
      .from("profiles")
      .select("data")
      .eq("user_id", user.id)
      .maybeSingle<{ data: Profile }>();
    return (data?.data ?? {}) as Profile;
  } catch {
    return {};
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

function deepMerge(
  target: Record<string, unknown>,
  src: Record<string, unknown>,
): Record<string, unknown> {
  for (const [k, v] of Object.entries(src)) {
    const cur = target[k];
    if (isPlainObject(v) && isPlainObject(cur)) {
      target[k] = deepMerge(
        { ...(cur as Record<string, unknown>) },
        v as Record<string, unknown>,
      );
    } else {
      target[k] = v;
    }
  }
  return target;
}

/**
 * Patches `config/profile.yml` with a deep-merged partial dict. Preserves
 * unrelated fields, backs up the existing file once before writing, and
 * returns the merged document so the caller can echo back the new state.
 */
export async function writeProfile(updates: Profile): Promise<Profile> {
  const existing = await readProfile();

  const existingRec = { ...(existing as Record<string, unknown>) };
  const updatesRec = { ...(updates as Record<string, unknown>) };

  /**
   * `portals` is always a full snapshot from the profile editor (tracked_companies +
   * optional filters). Deep-merging it into the prior value would keep removed keys
   * (e.g. cleared `company_filter` or title/location negatives).
   */
  if (Object.prototype.hasOwnProperty.call(updatesRec, "portals")) {
    existingRec.portals = updatesRec.portals;
    delete updatesRec.portals;
  }

  const merged = deepMerge(existingRec, updatesRec);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new UnauthorizedError("Sign in required to update profile.");
  }
  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: user.id,
        data: merged,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (error) throw error;

  return merged as Profile;
}

/** Convenience helpers used in many places. */
export function candidateFullName(profile: Profile): string {
  return (profile.candidate?.full_name ?? "").trim();
}

export function candidateFirstName(profile: Profile): string {
  const full = candidateFullName(profile);
  return full ? full.split(/\s+/)[0] : "";
}

export function candidateInitials(profile: Profile): string {
  const full = candidateFullName(profile);
  if (!full) return "?";
  return (
    full
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}
