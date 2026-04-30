import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, copyFile, access } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { CV_PATH } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await access(CV_PATH);
  } catch {
    return NextResponse.json({ markdown: "", exists: false });
  }
  try {
    const markdown = await readFile(CV_PATH, "utf-8");
    return NextResponse.json({ markdown, exists: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}

/** Write `cv.md` — backups `cv.md.bak` once on first overwrite. */
export async function PUT(req: NextRequest) {
  let body: { markdown?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const md = typeof body.markdown === "string" ? body.markdown : "";
  try {
    await mkdir(dirname(CV_PATH), { recursive: true });
    try {
      await access(CV_PATH);
      await copyFile(CV_PATH, `${CV_PATH}.bak`);
    } catch {
      /* no prior file — nothing to backup */
    }
    await writeFile(CV_PATH, md, "utf-8");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
