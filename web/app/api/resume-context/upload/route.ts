import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/api";
import { extractTextFromPdfBuffer } from "@/lib/pdf-resume";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isPdfFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === "application/pdf" || name.endsWith(".pdf");
}

function hasPdfHeader(buffer: Buffer): boolean {
  return (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  );
}

function toResumeMarkdown(extractedText: string, filename: string): string {
  return [
    `# Imported Resume (${filename})`,
    "",
    "> Auto-generated from uploaded PDF. Review and edit as needed.",
    "",
    extractedText.trim(),
  ].join("\n");
}

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
        { error: "Missing or empty resume PDF (field name: resume)" },
        { status: 400 },
      );
    }
    if (!isPdfFile(resumeEntry)) {
      return NextResponse.json(
        {
          error:
            "Only PDF resumes are supported. Choose a `.pdf` or `application/pdf` file.",
        },
        { status: 400 },
      );
    }

    const arrayBuffer = await resumeEntry.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (!hasPdfHeader(buffer)) {
      return NextResponse.json(
        { error: "Uploaded file is not a valid PDF binary." },
        { status: 400 },
      );
    }

    const extracted = await extractTextFromPdfBuffer(buffer);
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
      message: "Resume PDF imported and converted to markdown.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message ?? "Upload failed" },
      { status: 500 },
    );
  }
}
