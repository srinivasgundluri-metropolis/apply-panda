/**
 * Read + deep-merge `config/profile.yml`. Uses the `yaml` library which is
 * a Next.js-friendly pure-JS parser. Backups follow the same convention as
 * the Python side (writes `profile.yml.bak` once per merge).
 */

import { readFile, writeFile, copyFile, access } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import * as yaml from "yaml";
import { PROFILE_PATH } from "./paths";
import type { Profile } from "./types";

function exists(p: string): Promise<boolean> {
  return access(p).then(
    () => true,
    () => false,
  );
}

export async function readProfile(): Promise<Profile> {
  if (!(await exists(PROFILE_PATH))) return {};
  const raw = await readFile(PROFILE_PATH, "utf-8");
  try {
    const parsed = yaml.parse(raw);
    return (parsed as Profile) ?? {};
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
  await mkdir(dirname(PROFILE_PATH), { recursive: true });

  const existing = await readProfile();
  const backupPath = `${PROFILE_PATH}.bak`;
  if ((await exists(PROFILE_PATH)) && !(await exists(backupPath))) {
    await copyFile(PROFILE_PATH, backupPath).catch(() => {
      /* non-fatal */
    });
  }

  const merged = deepMerge(
    { ...(existing as Record<string, unknown>) },
    updates as Record<string, unknown>,
  );
  const serialized = yaml.stringify(merged, {
    indent: 2,
    lineWidth: 120,
  });
  await writeFile(PROFILE_PATH, serialized, "utf-8");
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
