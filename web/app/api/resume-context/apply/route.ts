import { NextRequest, NextResponse } from "next/server";
import {
  applyResumeCoachInstruction,
  buildInstructionFromUploadedResumeExtract,
} from "@/lib/resume-coach";
import { extractTextFromPdfBuffer } from "@/lib/pdf-resume";
import { readApplications } from "@/lib/parse-applications";
import { candidateFullName, readProfile } from "@/lib/profile";
import { candidateSlug } from "@/lib/slugify";
import { requireApiUser } from "@/lib/supabase/api";

export const dynamic = "force-dynamic";

function isPdfFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === "application/pdf" || name.endsWith(".pdf");
}

async function jsonResponseAfterApply(instruction: string): Promise<NextResponse> {
  const result = await applyResumeCoachInstruction(instruction);
  const profile = await readProfile();
  const slug = candidateSlug(candidateFullName(profile));
  const rows = await readApplications(slug);
  const regenCandidates = rows
    .filter(
      (r) =>
        r.status.trim() !== "Applied" && (r.hasCvSuite || r.hasCl),
    )
    .slice(0, 24)
    .map((r) => ({
      num: r.num,
      company: r.company,
      role: r.role,
    }));

  let message = result.chat_reply_md;
  if (regenCandidates.length > 0) {
    message +=
      "\n\n---\n\n### Regenerate tailored PDFs?\n" +
      "Because your canon files changed, consider **regenerating** tailored ATS + full CV PDFs " +
      "and/or cover letters for roles **not** yet marked **Applied** — so downloads match your new résumé and profile.\n\n" +
      "Open **[Tracker → Tailored documents](/tracker)** for each evaluated job and use " +
      "**Regenerate CVs**, **Regenerate letter**, or **Regenerate CVs + letter** as needed.\n\n" +
      "**Rows with tailored PDFs (Eligible to refresh)**\n\n";
    message += regenCandidates
      .slice(0, 12)
      .map((r) => `- **#${r.num}** ${r.company} — ${r.role}`)
      .join("\n");
    if (regenCandidates.length > 12) {
      message += `\n\n_(${regenCandidates.length - 12} more — see Tracker table view.)_`;
    }
  }

  return NextResponse.json({
    ok: true,
    message,
    chat_reply_md: result.chat_reply_md,
    updated: result.updated,
    regenCandidates,
  });
}

/**
 * Applies résumé / profile / cover-letter-base edits via the coach pipeline.
 *
 * - **application/json**: `{ instruction: string }`
 * - **multipart/form-data**: fields `resume` (PDF file) and optional `instruction` (notes)
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const contentType = req.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
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
              "Only PDF résumés are supported. Choose a `.pdf` or `application/pdf` file.",
          },
          { status: 400 },
        );
      }

      const arrayBuffer = await resumeEntry.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      let extracted: string;
      try {
        extracted = await extractTextFromPdfBuffer(buffer);
      } catch (e) {
        return NextResponse.json(
          { error: (e as Error).message ?? "PDF parsing failed" },
          { status: 400 },
        );
      }

      const note = String(formData.get("instruction") ?? "").trim();
      const instruction = buildInstructionFromUploadedResumeExtract(
        extracted,
        note || undefined,
      );

      try {
        return await jsonResponseAfterApply(instruction);
      } catch (e) {
        return NextResponse.json(
          { error: (e as Error).message ?? "Apply failed" },
          { status: 500 },
        );
      }
    }

    let body: { instruction?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const instruction = (body.instruction ?? "").trim();
    if (!instruction) {
      return NextResponse.json(
        { error: "instruction is required" },
        { status: 400 },
      );
    }

    try {
      return await jsonResponseAfterApply(instruction);
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message ?? "Apply failed" },
        { status: 500 },
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message ?? "Request failed" },
      { status: 500 },
    );
  }
}
