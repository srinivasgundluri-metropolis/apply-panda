import { NextRequest, NextResponse } from "next/server";
import { fetchJobDescription } from "@/lib/fetch-jd";
import { requireApiUser } from "@/lib/supabase/api";

export const dynamic = "force-dynamic";

/** Server-side JD fetch — bypasses CORS and shields the user's IP. */
export async function POST(req: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const url = (body.url ?? "").trim();
  if (!url) {
    return NextResponse.json({ error: "URL required" }, { status: 400 });
  }
  const result = await fetchJobDescription(url);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ text: result.text });
}
