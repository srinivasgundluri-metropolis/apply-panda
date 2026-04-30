/**
 * Hiring-manager outreach: Gemini draft generation + optional SMTP send.
 * API keys: GEMINI_API_KEY (process.env or repo-root .env). SMTP: SMTP_* env vars.
 */

import { readFile } from "node:fs/promises";
import nodemailer from "nodemailer";
import { geminiGenerateContent, formatGeminiHttpError } from "./gemini-generate";
import { ENV_PATH } from "./paths";

const GEMINI_MODEL = "gemini-2.0-flash";

export async function resolveGeminiApiKey(): Promise<string | undefined> {
  const fromEnv = process.env.GEMINI_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  try {
    const raw = await readFile(ENV_PATH, "utf-8");
    for (const line of raw.split(/\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const key = t.slice(0, i).trim();
      if (key !== "GEMINI_API_KEY") continue;
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      return v || undefined;
    }
  } catch {
    /* missing .env */
  }
  return undefined;
}

export function smtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASSWORD?.trim(),
  );
}

export function parseEmailJson(raw: string): { subject: string; body: string } {
  let t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const obj = JSON.parse(t) as { subject?: unknown; body?: unknown };
  const subject = String(obj.subject ?? "").trim();
  const body = String(obj.body ?? "").trim().replace(/\\n/g, "\n");
  if (!subject || !body) throw new Error("Model did not return subject and body");
  return { subject, body };
}

export async function generateOutreachViaGemini(
  fullPrompt: string,
  apiKey: string,
): Promise<{ subject: string; body: string }> {
  const res = await geminiGenerateContent(GEMINI_MODEL, apiKey, {
    contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
    generationConfig: {
      temperature: 0.65,
      maxOutputTokens: 2048,
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(formatGeminiHttpError(res.status, detail));
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };
  if (data.error?.message) throw new Error(data.error.message);
  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("Gemini returned empty text");
  return parseEmailJson(text);
}

export interface SendMailParams {
  from: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export async function sendOutreachMail(params: SendMailParams): Promise<void> {
  if (!smtpConfigured())
    throw new Error("SMTP is not configured (set SMTP_HOST, SMTP_USER, SMTP_PASSWORD)");

  const port = Number(process.env.SMTP_PORT ?? "587");
  const secure = process.env.SMTP_SECURE === "true";

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: process.env.SMTP_PASSWORD!.trim(),
    },
  });

  await transporter.sendMail({
    from: params.from,
    to: params.to,
    subject: params.subject,
    text: params.text,
    replyTo: params.replyTo || undefined,
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isLikelyEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim());
}
