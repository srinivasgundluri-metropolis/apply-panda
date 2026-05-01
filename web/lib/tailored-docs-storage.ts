import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

/** Reject traversal and ensure uploads only ever land under `{userId}/`. */
function assertOwnedUserStoragePath(storagePath: string, userId: string): void {
  if (storagePath.includes("..")) {
    throw new Error("Invalid storage path.");
  }
  const prefix = `${userId}/`;
  if (!storagePath.startsWith(prefix)) {
    throw new Error(`Storage path must start with authenticated user prefix.`);
  }
}

/**
 * Server-side uploads: user JWT Storage RLS occasionally fails (“new row violates RLS”).
 * Use service role only when SUPABASE_SERVICE_ROLE_KEY is set; path MUST pass
 * assertOwnedUserStoragePath first. Force user JWT with APPLYPANDA_STORAGE_FORCE_USER_JWT=true.
 */
function clientForDocumentsStorageUpload(userClient: SupabaseClient): SupabaseClient {
  const forceJwt = ["1", "true", "yes"].includes(
    (process.env.APPLYPANDA_STORAGE_FORCE_USER_JWT ?? "").trim().toLowerCase(),
  );
  if (forceJwt) return userClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return userClient;
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

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

  assertOwnedUserStoragePath(storagePath, userId);
  const storageClient = clientForDocumentsStorageUpload(supabase);

  const { error: upErr } = await storageClient.storage
    .from("documents")
    .upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });

  if (upErr) {
    throw new Error(
      `Storage.upload failed (${contentType.split(";")[0]}): ${upErr.message}. ` +
        `Re-run Storage policies (web/supabase/storage-documents-policies.sql) and MIME rules ` +
        `(alter-storage-documents-bucket-mime.sql). Path: ${storagePath}`,
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
    await storageClient.storage.from("documents").remove([storagePath]);
    throw new Error(
      `documents table insert failed: ${formatPostgrestError(insErr)}`,
    );
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

/**
 * Printable HTML when headless PDF is unavailable (open in browser → Print → Save as PDF).
 *
 * Stored as generic binary MIME so restrictive buckets (`application/pdf` only, etc.)
 * don’t reject the upload — `/api/files/...` still serves `.html` with `Content-Type:
 * text/html` from the file extension (see MIME_BY_EXT there).
 */
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
    contentType: "application/octet-stream",
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
