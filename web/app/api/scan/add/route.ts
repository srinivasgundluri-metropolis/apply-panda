import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/api";
import type { AddToScanResult, LinkedInResult } from "@/lib/types";

export const dynamic = "force-dynamic";

interface AddBody {
  jobs: LinkedInResult[];
  alsoPipeline?: boolean;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  let body: AddBody;
  try {
    body = (await req.json()) as AddBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(body.jobs) || body.jobs.length === 0) {
    return NextResponse.json(
      { error: "Body must include a non-empty `jobs` array" },
      { status: 400 },
    );
  }

  try {
    const urls = Array.from(
      new Set(
        body.jobs
          .map((j) => (j.url ?? "").trim())
          .filter(Boolean),
      ),
    );
    if (urls.length === 0) {
      return NextResponse.json(
        { error: "All jobs are missing URLs; cannot save scan-history rows." },
        { status: 400 },
      );
    }

    const { data: existingRows, error: existingErr } = await auth.supabase
      .from("scan_history")
      .select("url")
      .eq("user_id", auth.user.id)
      .in("url", urls);
    if (existingErr) throw existingErr;
    const existing = new Set((existingRows ?? []).map((r) => String(r.url ?? "")));

    const now = new Date().toISOString();
    const toInsert = body.jobs
      .map((job) => ({
        user_id: auth.user.id,
        url: (job.url ?? "").trim(),
        first_seen: now,
        portal: (job.source ?? "linkedin").trim() || "linkedin",
        title: (job.title ?? "").trim(),
        company: (job.company ?? "").trim(),
        status: "new",
      }))
      .filter((row) => row.url && !existing.has(row.url));

    if (toInsert.length > 0) {
      const { error: insertErr } = await auth.supabase
        .from("scan_history")
        .insert(toInsert);
      if (insertErr) throw insertErr;
    }

    const result: AddToScanResult = {
      added: toInsert.length,
      skipped_duplicates: urls.length - toInsert.length,
      total: urls.length,
      also_pipeline: body.alsoPipeline ? 0 : undefined,
      added_jobs: toInsert.map((row) => ({
        url: row.url,
        company: row.company,
        title: row.title,
        portal: row.portal,
      })),
      error: null,
    };
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
