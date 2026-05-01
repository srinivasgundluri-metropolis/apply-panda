import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/api";
import { formatPostgrestError } from "@/lib/supabase-error";

function slugFileSegment(s: string): string {
  return (
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "job"
  );
}

/**
 * Saves Tailored-docs Gemini output as Markdown under the user's Storage prefix,
 * plus a row in `documents` (kind `draft`). Real PDF binaries are not produced
 * in hosted mode yet — this artifact is downloadable from **Documents** and `/api/files/...`.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  let body: {
    applicationNum?: string;
    kind?: "cv" | "cl" | "both";
    markdown?: string;
    company?: string;
    role?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const num = (body.applicationNum ?? "").trim();
  const kind = body.kind;
  const markdown = (body.markdown ?? "").trim();
  const company = (body.company ?? "").trim() || "company";
  const role = (body.role ?? "").trim() || "role";

  if (!num || (kind !== "cv" && kind !== "cl" && kind !== "both")) {
    return NextResponse.json(
      { error: "applicationNum and kind (cv|cl|both) are required" },
      { status: 400 },
    );
  }

  if (markdown.length < 40) {
    return NextResponse.json(
      {
        error:
          "Model output too short to save — expand the streamed text or retry generation.",
      },
      { status: 400 },
    );
  }

  const { data: appMatch, error: appErr } = await auth.supabase
    .from("applications")
    .select("id")
    .eq("user_id", auth.user.id)
    .eq("num", num)
    .maybeSingle();

  if (appErr)
    return NextResponse.json(
      { error: formatPostgrestError(appErr) },
      { status: 500 },
    );
  if (!appMatch)
    return NextResponse.json(
      { error: `Application #${num} not found for this account.` },
      { status: 404 },
    );

  const uid = auth.user.id;
  const ts = Date.now();
  const slug = `${slugFileSegment(company)}-${slugFileSegment(role)}`;
  const label =
    kind === "both" ? "bundle" : kind === "cv" ? "cv-draft" : "cl-draft";
  const storagePath = `${uid}/drafts/${num}-${slug}-${label}-${ts}.md`;

  const buffer = Buffer.from(markdown, "utf8");

  const { error: upErr } = await auth.supabase.storage
    .from("documents")
    .upload(storagePath, buffer, {
      contentType: "text/markdown; charset=utf-8",
      upsert: true,
    });

  if (upErr) {
    return NextResponse.json(
      {
        error: `${upErr.message} — Check Supabase Storage: bucket **documents**, and RLS allowing writes under folder \`${uid}/\` (see comments in web/supabase/schema.sql).`,
      },
      { status: 502 },
    );
  }

  const prettyName =
    kind === "both"
      ? `Draft CV+letter · ${company} · ${role}.md`
      : kind === "cv"
        ? `Draft CV · ${company} · ${role}.md`
        : `Draft letter · ${company} · ${role}.md`;

  const { error: rowErr } = await auth.supabase.from("documents").insert({
    user_id: uid,
    name: prettyName,
    storage_path: storagePath,
    kind: "draft",
    size: buffer.length,
    mtime: ts,
    metadata: {
      application_num: num,
      doc_kind: kind,
      format: "markdown",
      source: "docs_generate",
    },
  });

  if (rowErr) {
    await auth.supabase.storage.from("documents").remove([storagePath]);
    return NextResponse.json(
      { error: formatPostgrestError(rowErr) },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, storage_path: storagePath });
}
