import { NextResponse } from "next/server";
import { readScanHistory } from "@/lib/scan-history";
import { requireApiUser } from "@/lib/supabase/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  try {
    const rows = await readScanHistory();
    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
