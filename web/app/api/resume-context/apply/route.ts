import { NextRequest, NextResponse } from "next/server";
import {
  applyResumeCoachInstruction,
  buildInstructionFromUploadedResumeMarkdown,
} from "@/lib/resume-coach";
import { readApplications } from "@/lib/parse-applications";
import { candidateFullName, readProfile } from "@/lib/profile";
import { candidateSlug } from "@/lib/slugify";
import { requireApiUser } from "@/lib/supabase/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
      "\n\n---\n\n### Regenerate tailored documents?\n" +
      "Because your canon files changed, consider **regenerating** tailored ATS + full CV outputs " +
      "and/or cover letters for roles **not** yet marked **Applied** — so downloads match your new résumé and profile.\n\n" +
      "Open **[Tracker → Tailored documents](/tracker)** for each evaluated job and use " +
      "**Regenerate CVs**, **Regenerate letter**, or **Regenerate CVs + letter** as needed.\n\n" +
      "**Rows with tailored files (Eligible to refresh)**\n\n";
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
 * - **application/json**:
 *   `{ instruction?: string, uploadedResumeMarkdown?: string }`
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    let body: { instruction?: string; uploadedResumeMarkdown?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const instructionText = (body.instruction ?? "").trim();
    const uploadedResumeMarkdown = (body.uploadedResumeMarkdown ?? "").trim();
    if (!instructionText && !uploadedResumeMarkdown) {
      return NextResponse.json(
        { error: "instruction or uploadedResumeMarkdown is required" },
        { status: 400 },
      );
    }
    const instruction = uploadedResumeMarkdown
      ? buildInstructionFromUploadedResumeMarkdown(
          uploadedResumeMarkdown,
          instructionText || undefined,
        )
      : instructionText;

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
