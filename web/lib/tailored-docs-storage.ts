import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPostgrestError } from "@/lib/supabase-error";

export function slugTailoredSegment(raw: string): string {
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "role"
  );
}

export async function uploadUserPdf(params: {
  supabase: SupabaseClient;
  userId: string;
  storagePath: string;
  buffer: Buffer;
  displayName: string;
  kind: "cv" | "cl";
  metadata: Record<string, unknown>;
}): Promise<void> {
  const { supabase, userId, storagePath, buffer, displayName, kind, metadata } =
    params;

  const { error: upErr } = await supabase.storage
    .from("documents")
    .upload(storagePath, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (upErr) {
    throw new Error(
      `PDF upload failed: ${upErr.message}. Ensure Storage policies allow ${userId}/ (see web/supabase/storage-documents-policies.sql).`,
    );
  }

  const { error: insErr } = await supabase.from("documents").insert({
    user_id: userId,
    name: displayName,
    storage_path: storagePath,
    kind,
    size: buffer.length,
    mtime: Date.now(),
    metadata,
  });

  if (insErr) {
    await supabase.storage.from("documents").remove([storagePath]);
    throw new Error(formatPostgrestError(insErr));
  }
}
