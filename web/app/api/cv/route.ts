import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  try {
    const { data, error } = await auth.supabase
      .from("resumes")
      .select("content_md")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error) throw error;
    const markdown = (data?.content_md ?? "").trim();
    return NextResponse.json({ markdown, exists: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}

/** Write `cv.md` — backups `cv.md.bak` once on first overwrite. */
export async function PUT(req: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  let body: { markdown?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const md = typeof body.markdown === "string" ? body.markdown : "";
  try {
    const { error } = await auth.supabase
      .from("resumes")
      .upsert(
        {
          user_id: auth.user.id,
          content_md: md,
          updated_at: new Date().toISOString(),
          source: "editor",
        },
        { onConflict: "user_id" },
      );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
