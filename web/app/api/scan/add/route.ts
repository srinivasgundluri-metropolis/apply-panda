import { NextRequest, NextResponse } from "next/server";
import { runJsonScript } from "@/lib/shell";
import { SCRIPT_ADD_TO_SCAN } from "@/lib/paths";
import type { AddToScanResult, LinkedInResult } from "@/lib/types";

export const dynamic = "force-dynamic";

interface AddBody {
  jobs: LinkedInResult[];
  alsoPipeline?: boolean;
}

export async function POST(req: NextRequest) {
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

  const args = ["--from-stdin"];
  if (body.alsoPipeline) args.push("--also-pipeline");

  // The .mjs script accepts either `[...]` or `{ results: [...] }` — we
  // pass the wrapper shape so it matches scrape-linkedin.mjs output 1:1.
  const stdin = JSON.stringify({ results: body.jobs });

  try {
    const result = await runJsonScript<AddToScanResult>(SCRIPT_ADD_TO_SCAN, {
      args,
      input: stdin,
      timeoutMs: 30_000,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
