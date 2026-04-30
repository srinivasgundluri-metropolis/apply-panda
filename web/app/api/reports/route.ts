import { NextResponse } from "next/server";
import { listReports } from "@/lib/parse-reports";
import { requireApiUser } from "@/lib/supabase/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  try {
    const reports = await listReports();
    return NextResponse.json({ reports });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
