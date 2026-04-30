import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/api";
import {
  extractTextFromResumeUpload,
  isSupportedResumeUpload,
  toResumeMarkdown,
} from "@/lib/resume-upload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  try {
    const formData = await req.formData();
    const resumeEntry = formData.get("resume");
    if (!(resumeEntry instanceof File) || resumeEntry.size === 0) {
      return NextResponse.json(
        { error: "Missing or empty resume file (field name: resume)" },
        { status: 400 },
      );
    }
    const name = resumeEntry.name.toLowerCase();
    if (name.endsWith(".pdf") || resumeEntry.type === "application/pdf") {
      return NextResponse.json(
        {
          error:
            "PDF uploads are disabled. Upload `.docx`, `.md`, or `.txt` instead.",
        },
        { status: 400 },
      );
    }
    if (!isSupportedResumeUpload(resumeEntry)) {
      return NextResponse.json(
        { error: "Unsupported file type. Use `.docx`, `.md`, or `.txt`." },
        { status: 400 },
      );
    }

    const extracted = await extractTextFromResumeUpload(resumeEntry);
    if (!extracted) {
      return NextResponse.json(
        {
          error:
            "Could not extract text from this file. Re-export as `.docx` or provide markdown text.",
        },
        { status: 400 },
      );
    }
    const markdown = toResumeMarkdown(extracted, resumeEntry.name);
    const { error } = await auth.supabase.from("resumes").upsert(
      {
        user_id: auth.user.id,
        content_md: markdown,
        updated_at: new Date().toISOString(),
        source: "upload",
      },
      { onConflict: "user_id" },
    );
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      markdown,
      extractedChars: extracted.length,
      message: "Resume file imported and converted to markdown.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message ?? "Upload failed" },
      { status: 500 },
    );
  }
}
