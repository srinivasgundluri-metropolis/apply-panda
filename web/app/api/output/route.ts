import { NextResponse } from "next/server";
import { readdir, stat, access } from "node:fs/promises";
import { join, relative } from "node:path";
import { OUTPUT_DIR, COVER_LETTERS_DIR, REPO_ROOT } from "@/lib/paths";

export const dynamic = "force-dynamic";

interface OutputFile {
  name: string;
  /** path relative to REPO_ROOT, e.g. "output/cv-...pdf" */
  relPath: string;
  /** size in bytes */
  size: number;
  /** Unix epoch ms */
  mtime: number;
  kind: "cv" | "cl" | "other";
}

async function exists(p: string): Promise<boolean> {
  return access(p).then(
    () => true,
    () => false,
  );
}

async function listDir(
  dir: string,
  kindGuess: (name: string) => OutputFile["kind"],
): Promise<OutputFile[]> {
  if (!(await exists(dir))) return [];
  const entries = await readdir(dir);
  const files: OutputFile[] = [];
  for (const name of entries) {
    if (!name.endsWith(".pdf")) continue;
    const path = join(dir, name);
    try {
      const s = await stat(path);
      if (!s.isFile()) continue;
      files.push({
        name,
        relPath: relative(REPO_ROOT, path),
        size: s.size,
        mtime: s.mtimeMs,
        kind: kindGuess(name),
      });
    } catch {
      // skip unreadable
    }
  }
  return files;
}

export async function GET() {
  const cvKind = (n: string): OutputFile["kind"] =>
    n.startsWith("cv-") ? "cv" : "other";
  const clKind = (n: string): OutputFile["kind"] =>
    n.startsWith("cover-letter-") ? "cl" : "other";

  const [cvs, cls] = await Promise.all([
    listDir(OUTPUT_DIR, cvKind),
    listDir(COVER_LETTERS_DIR, clKind),
  ]);
  const all = [...cvs, ...cls];
  all.sort((a, b) => b.mtime - a.mtime);
  return NextResponse.json({ files: all });
}
