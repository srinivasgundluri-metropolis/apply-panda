import { NextRequest, NextResponse } from "next/server";
import { updateScanStatus } from "@/lib/scan-history";
import { requireApiUser } from "@/lib/supabase/api";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  let body: { url?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const url = (body.url ?? "").trim();
  const status = (body.status ?? "").trim();
  if (!url || !status) {
    return NextResponse.json(
      { error: "Both `url` and `status` are required" },
      { status: 400 },
    );
  }
  try {
    const ok = await updateScanStatus(url, status);
    if (!ok) {
      return NextResponse.json(
        { error: `No scan-history row found for URL: ${url}` },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
