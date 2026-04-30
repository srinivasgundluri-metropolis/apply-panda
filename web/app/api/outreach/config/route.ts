import { NextResponse } from "next/server";
import { readProfile } from "@/lib/profile";
import {
  resolveGeminiApiKey,
  smtpConfigured,
} from "@/lib/outreach-mail";

export const dynamic = "force-dynamic";

export async function GET() {
  const profile = await readProfile();
  const candidateEmail =
    profile.candidate?.email?.trim() || process.env.SMTP_FROM?.trim();

  const gemini = await resolveGeminiApiKey();
  const smtpOk = smtpConfigured();

  return NextResponse.json({
    canGenerate: Boolean(gemini),
    canSend: smtpOk,
    fromEmail:
      candidateEmail ||
      process.env.SMTP_USER?.trim() ||
      null,
  });
}
