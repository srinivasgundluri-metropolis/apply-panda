import { NextRequest, NextResponse } from "next/server";
import { searchLinkedInGuest } from "@/lib/linkedin-guest-search";
import type { LinkedInResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

interface SearchBody {
  keywords?: string;
  location?: string;
  limit?: number;
  timeRange?: "24h" | "week" | "month" | "any";
  remote?: boolean;
}

export async function POST(req: NextRequest) {
  let body: SearchBody;
  try {
    body = (await req.json()) as SearchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.keywords && !body.location) {
    return NextResponse.json(
      { error: "At least one of `keywords` or `location` is required" },
      { status: 400 },
    );
  }

  try {
    const result: LinkedInResponse = await searchLinkedInGuest({
      keywords: body.keywords,
      location: body.location,
      limit: body.limit,
      timeRange: body.timeRange,
      remote: body.remote,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 502 },
    );
  }
}
