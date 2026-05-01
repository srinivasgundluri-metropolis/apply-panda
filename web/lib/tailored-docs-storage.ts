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

type UploadTailoredArtifactParams = {
  supabase: SupabaseClient;
  userId: string;
  storagePath: string;
  buffer: Buffer;
  displayName: string;
  kind: "cv" | "cl";
  metadata: Record<string, unknown>;
  contentType: string;
};

async function uploadTailoredArtifact(params: UploadTailoredArtifactParams) {
  const {
    supabase,
    userId,
    storagePath,
    buffer,
    displayName,
    kind,
    metadata,
    contentType,
  } = params;

  const { error: upErr } = await supabase.storage
    .from("documents")
    .upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });

  if (upErr) {
    throw new Error(
      `Upload failed (${contentType.split(";")[0]}): ${upErr.message}. Ensure Storage policies allow ${userId}/ (see web/supabase/storage-documents-policies.sql).`,
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

/** Tailored ATS/full CV → PDF in private `documents` bucket + row in `documents`. */
export async function uploadUserPdf(params: {
  supabase: SupabaseClient;
  userId: string;
  storagePath: string;
  buffer: Buffer;
  displayName: string;
  kind: "cv" | "cl";
  metadata: Record<string, unknown>;
}): Promise<void> {
  return uploadTailoredArtifact({
    ...params,
    contentType: "application/pdf",
  });
}

/** Printable HTML when headless PDF is unavailable (open in browser → Print → Save as PDF). */
export async function uploadUserTailoredHtml(params: {
  supabase: SupabaseClient;
  userId: string;
  storagePath: string;
  html: string;
  displayName: string;
  kind: "cv" | "cl";
  metadata: Record<string, unknown>;
}): Promise<void> {
  const buffer = Buffer.from(params.html, "utf-8");
  return uploadTailoredArtifact({
    supabase: params.supabase,
    userId: params.userId,
    storagePath: params.storagePath,
    buffer,
    displayName: params.displayName,
    kind: params.kind,
    metadata: params.metadata,
    contentType: "text/html; charset=utf-8",
  });
}

/** Word-compatible tailored CV/cover (.docx) from hosted HTML conversion. */
export async function uploadUserTailoredDocx(params: {
  supabase: SupabaseClient;
  userId: string;
  storagePath: string;
  buffer: Buffer;
  displayName: string;
  kind: "cv" | "cl";
  metadata: Record<string, unknown>;
}): Promise<void> {
  return uploadTailoredArtifact({
    ...params,
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
