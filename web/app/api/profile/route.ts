import { NextRequest, NextResponse } from "next/server";
import { readProfile, writeProfile } from "@/lib/profile";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await readProfile();
    return NextResponse.json({ profile });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  let body: Profile;
  try {
    body = (await req.json()) as Profile;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Body must be a JSON object" },
      { status: 400 },
    );
  }
  try {
    const merged = await writeProfile(body);
    return NextResponse.json({ profile: merged });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
