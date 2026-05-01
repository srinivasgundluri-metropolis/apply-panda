import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/api";

export const dynamic = "force-dynamic";

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export async function GET(
  _req: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const { path } = await context.params;
  const key = (path ?? []).map((s) => decodeURIComponent(s)).join("/");
  if (!key) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { data, error } = await auth.supabase.storage
      .from("documents")
      .download(key);
    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    const ext = key.split(".").pop()?.toLowerCase() ?? "";
    const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
