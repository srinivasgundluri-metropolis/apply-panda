import { NextResponse } from "next/server";
import { findReportByNum } from "@/lib/parse-reports";
import { requireApiUser } from "@/lib/supabase/api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ num: string }> },
) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { num } = await context.params;
  try {
    const report = await findReportByNum(num);
    if (!report) {
      return NextResponse.json(
        { error: `Report ${num} not found` },
        { status: 404 },
      );
    }
    return NextResponse.json({ report });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
