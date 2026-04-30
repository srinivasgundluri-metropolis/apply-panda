import { NextResponse } from "next/server";
import { readApplications } from "@/lib/parse-applications";
import { readProfile, candidateFullName } from "@/lib/profile";
import { candidateSlug } from "@/lib/slugify";

// We never want this cached — applications.md is mutated by the .mjs scripts
// and by user edits, so the dashboard must always read fresh from disk.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await readProfile();
    const slug = candidateSlug(candidateFullName(profile));
    const rows = await readApplications(slug);
    return NextResponse.json({ rows, candidateSlug: slug });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
