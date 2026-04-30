import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { existsSync } from "node:fs";
import {
  REPO_ROOT,
  OUTPUT_DIR,
  REPORTS_DIR,
  COVER_LETTERS_DIR,
} from "@/lib/paths";

export const dynamic = "force-dynamic";

/**
 * Serve files from the career-ops repo back to the browser. SECURITY: only
 * paths inside `output/` and `reports/` are allowed — symlink/path-traversal
 * attempts that escape those roots are rejected with 403. We re-resolve
 * the requested path and verify it's still under one of the safe roots.
 */
const ALLOWED_ROOTS = [OUTPUT_DIR, REPORTS_DIR];

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/**
 * True if `fileAbs` lies inside directory `dirAbs`.
 * IMPORTANT: Never `path.resolve(relative(...))` — relative paths resolve
 * against cwd and break checks (false 403 for valid files under output/).
 */
function isUnder(dirAbs: string, fileAbs: string): boolean {
  const d = resolve(dirAbs);
  const f = resolve(fileAbs);
  const prefix = d.endsWith(sep) ? d : d + sep;
  return f.startsWith(prefix) || f === d;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const segments = path ?? [];

  let decoded: string[];
  try {
    decoded = segments.map((s) => decodeURIComponent(s));
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  for (const dec of decoded) {
    if (
      dec === "." ||
      dec === ".." ||
      dec.includes("\0") ||
      dec.includes("/") ||
      dec.includes("\\")
    ) {
      return NextResponse.json(
        { error: "Forbidden — invalid path segments" },
        { status: 403 },
      );
    }
  }

  /** Map public URL segments → absolute path inside allowed dirs. */
  let target: string | null = null;

  if (decoded.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [first, ...rest] = decoded;
  const firstKey = first.toLowerCase();

  if (firstKey === "reports") {
    target = resolve(REPO_ROOT, "reports", ...rest);
  } else if (firstKey === "output") {
    /* Legacy/full: /api/files/output/cv-….pdf — also Output/… from old bookmarks */
    target = resolve(REPO_ROOT, "output", ...rest);
  } else if (firstKey === "cover-letters") {
    /** /api/files/cover-letters/… → repo/output/cover-letters/… */
    target =
      rest.length === 0
        ? null
        : join(COVER_LETTERS_DIR, ...rest);
  } else if (
    rest.length === 0 &&
    first.toLowerCase().endsWith(".pdf")
  ) {
    /** Short form: /api/files/cv-….pdf — preserve filename casing for Linux */
    target = join(OUTPUT_DIR, first);
  } else {
    target = null;
  }

  if (!target) {
    return NextResponse.json(
      { error: "Forbidden — unknown path pattern" },
      { status: 403 },
    );
  }

  if (!ALLOWED_ROOTS.some((root) => isUnder(root, target))) {
    return NextResponse.json(
      { error: "Forbidden — path outside allowed roots" },
      { status: 403 },
    );
  }

  let stats;
  try {
    stats = await stat(target);
  } catch {
    // Help operators when cwd / REPO_ROOT was wrong during dev.
    const hint =
      process.env.NODE_ENV === "development" &&
      !existsSync(resolve(REPO_ROOT, "output"))
        ? " (check Next.js cwd: run `npm run dev` from career-ops/web/ or repo root after fix)"
        : "";
    return NextResponse.json(
      { error: `Not found${hint}` },
      { status: 404 },
    );
  }
  if (!stats.isFile()) {
    return NextResponse.json({ error: "Not a file" }, { status: 404 });
  }

  const buffer = await readFile(target);
  const ext = target.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, max-age=60",
    },
  });
}
