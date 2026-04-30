import { NextResponse } from "next/server";
import { listReports } from "@/lib/parse-reports";

export const dynamic = "force-dynamic";

export async function GET() {
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
