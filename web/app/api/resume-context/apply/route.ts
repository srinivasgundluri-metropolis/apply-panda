import { NextRequest, NextResponse } from "next/server";
import {
  applyResumeCoachInstruction,
} from "@/lib/resume-coach";
import { readApplications } from "@/lib/parse-applications";
import { candidateFullName, readProfile } from "@/lib/profile";
import { candidateSlug } from "@/lib/slugify";

export const dynamic = "force-dynamic";

/**
 * Applies natural-language résumé / profile / cover-letter-preferences edits
 * to `cv.md`, `config/profile.yml`, and `config/cover-letter-base.md` via Gemini.
 *
 * Body: { instruction: string }
 */
export async function POST(req: NextRequest) {
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
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message ?? "Apply failed" },
      { status: 500 },
    );
  }
}
