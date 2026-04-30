import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireApiUser } from "@/lib/supabase/api";

export async function POST() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const { user, supabase } = auth;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!serviceRole || !url) {
    return NextResponse.json(
      { error: "Account deletion is not configured on this deployment." },
      { status: 503 },
    );
  }

  try {
    const { data: docs } = await supabase
      .from("documents")
      .select("storage_path")
      .eq("user_id", user.id);
    const paths = (docs ?? [])
      .map((d: Record<string, unknown>) => String(d.storage_path ?? ""))
      .filter(Boolean);
    if (paths.length > 0) {
      await supabase.storage.from("documents").remove(paths);
    }

    const tables = [
      "documents",
      "reports",
      "scan_history",
      "applications",
      "resumes",
      "profiles",
    ];
    for (const table of tables) {
      const { error } = await supabase.from(table).delete().eq("user_id", user.id);
      if (error) throw error;
    }

    const admin = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: deleteErr } = await admin.auth.admin.deleteUser(user.id);
    if (deleteErr) throw deleteErr;

    await supabase.auth.signOut();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Delete account failed." },
      { status: 500 },
    );
  }
}

