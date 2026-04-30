import { NextRequest, NextResponse } from "next/server";
import { candidateFullName, readProfile } from "@/lib/profile";
import {
  isLikelyEmail,
  sendOutreachMail,
  smtpConfigured,
} from "@/lib/outreach-mail";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!smtpConfigured()) {
    return NextResponse.json(
      {
        error:
          "SMTP is not configured. Set SMTP_HOST, SMTP_PORT (optional, default 587), SMTP_SECURE (optional), SMTP_USER, and SMTP_PASSWORD in the environment used by Next.js.",
      },
      { status: 503 },
    );
  }

  let body: { to?: string; subject?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const to = (body.to ?? "").trim();
  const subject = (body.subject ?? "").trim();
  const text = (body.body ?? "").trim();

  if (!to || !subject || !text) {
    return NextResponse.json(
      { error: "to, subject, and body are required" },
      { status: 400 },
    );
  }
  if (!isLikelyEmail(to)) {
    return NextResponse.json(
      { error: "recipient address does not look like a valid email" },
      { status: 400 },
    );
  }

  const profile = await readProfile();
  const fromProfile = profile.candidate?.email?.trim();
  const fromEnv = process.env.SMTP_FROM?.trim();
  const smtpUser = process.env.SMTP_USER?.trim();
  if (!smtpUser) {
    return NextResponse.json(
      { error: "SMTP_USER is missing in environment" },
      { status: 500 },
    );
  }

  const from = fromProfile || fromEnv || smtpUser;

  if (!isLikelyEmail(from)) {
    return NextResponse.json(
      {
        error:
          "sender address missing: set candidate.email in config/profile.yml and/or SMTP_FROM to match your mailbox identity.",
      },
      { status: 400 },
    );
  }

  const senderName = candidateFullName(profile);
  const fromHeader = senderName
    ? `"${senderName.replace(/"/g, "")}" <${from}>`
    : from;

  try {
    await sendOutreachMail({
      from: fromHeader,
      to,
      subject,
      text,
      replyTo: fromProfile || undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message ?? "Send failed" },
      { status: 500 },
    );
  }
}
