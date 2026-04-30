import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/api";

export const dynamic = "force-dynamic";

interface OutputFile {
  name: string;
  /** storage path under documents bucket */
  relPath: string;
  /** size in bytes */
  size: number;
  /** Unix epoch ms */
  mtime: number;
  kind: "cv" | "cl" | "other";
}

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { data, error } = await auth.supabase
    .from("documents")
    .select("name, storage_path, size, mtime, kind")
    .eq("user_id", auth.user.id)
    .order("mtime", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const files: OutputFile[] = (data ?? []).map((d: Record<string, unknown>) => ({
    name: String(d.name ?? ""),
    relPath: String(d.storage_path ?? ""),
    size: Number(d.size ?? 0),
    mtime: Number(d.mtime ?? Date.now()),
    kind: (String(d.kind ?? "other") as OutputFile["kind"]),
  }));
  return NextResponse.json({ files });
}
