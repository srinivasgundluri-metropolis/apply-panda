import { NextRequest, NextResponse } from "next/server";
import { join } from "node:path";
import { readFile, access } from "node:fs/promises";
import { REPO_ROOT, CV_PATH } from "@/lib/paths";
import { buildHiringManagerEmailPrompt } from "@/lib/prompts";
import { readProfile, candidateFullName } from "@/lib/profile";
import {
  resolveGeminiApiKey,
  generateOutreachViaGemini,
} from "@/lib/outreach-mail";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

function resolvePathUnderRepo(rel: string): string {
  if (!rel) return "";
  return rel.startsWith("/") ? rel : join(REPO_ROOT, rel);
}

async function readHead(path: string, max: number): Promise<string> {
  try {
    await access(path);
    const raw = await readFile(path, "utf-8");
    return raw.slice(0, max);
  } catch {
    return "";
  }
}

function proofLinesFromProfile(p: Profile): string {
  const pts = p.narrative?.proof_points;
  if (!pts || !Array.isArray(pts)) return "";
  const lines = pts.map((x) => {
    if (typeof x === "string") return x;
    if (x && typeof x === "object") {
      const o = x as { name?: string; hero_metric?: string; url?: string };
      return [o.name, o.hero_metric, o.url].filter(Boolean).join(" — ");
    }
    return String(x);
  });
  return lines.filter(Boolean).join("\n").slice(0, 6000);
}

export async function POST(req: NextRequest) {
  let body: {
    company?: string;
    role?: string;
    reportPath?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const company = (body.company ?? "").trim();
  const role = (body.role ?? "").trim();
  if (!company || !role) {
    return NextResponse.json(
      { error: "company and role are required" },
      { status: 400 },
    );
  }

  const apiKey = await resolveGeminiApiKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "GEMINI_API_KEY is not set. Add it to the repo root `.env` or configure `GEMINI_API_KEY` for the Next.js process.",
      },
      { status: 503 },
    );
  }

  const profile = await readProfile();
  const name = candidateFullName(profile);
  if (!name) {
    return NextResponse.json(
      {
        error:
          "candidate.full_name is missing in config/profile.yml — add it before generating outreach.",
      },
      { status: 400 },
    );
  }

  const reportRel = (body.reportPath ?? "").trim();
  const reportAbs = reportRel ? resolvePathUnderRepo(reportRel) : "";
  const [cvExcerpt, reportExcerpt] = await Promise.all([
    readHead(CV_PATH, 12000),
    reportAbs ? readHead(reportAbs, 16000) : Promise.resolve(""),
  ]);

  const prompt = buildHiringManagerEmailPrompt({
    company,
    role,
    candidateFullName: name,
    narrativeOneLiner: profile.narrative?.one_liner,
    superpower: profile.narrative?.superpower,
    proofLines: proofLinesFromProfile(profile),
    reportExcerpt,
    cvExcerpt,
  });

  try {
    const { subject, body: textBody } =
      await generateOutreachViaGemini(prompt, apiKey);
    return NextResponse.json({ subject, body: textBody });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message ?? "Generation failed" },
      { status: 500 },
    );
  }
}
