import { NextRequest, NextResponse } from "next/server";
import { isEmailAllowed } from "@/lib/auth-allowlist";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string };
    const email = String(body.email ?? "").trim();
    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }
    return NextResponse.json({ allowed: isEmailAllowed(email) });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}

