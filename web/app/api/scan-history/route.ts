import { NextResponse } from "next/server";
import { readScanHistory } from "@/lib/scan-history";

export const dynamic = "force-dynamic";

export async function GET() {
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
