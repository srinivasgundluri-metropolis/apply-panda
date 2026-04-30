import { NextRequest } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { streamProcess, SSE_HEADERS } from "@/lib/shell";
import { buildEvalPrompt } from "@/lib/prompts";
import { JDS_DIR, REPO_ROOT } from "@/lib/paths";

export const dynamic = "force-dynamic";

/**
 * Streams cursor-agent running the full A–G evaluation flow (`oferta`).
 * The JD text is staged to `jds/dashboard-{ts}.txt` so the agent has a
 * stable file path to refer to (matches the Streamlit `stage_jd` flow).
 *
 * Body shape:
 *   { jdText: string, sourceUrl?: string, model?: string }
 */
export async function POST(req: NextRequest) {
  let body: { jdText?: string; sourceUrl?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      `data: ${JSON.stringify({ type: "error", message: "Invalid JSON" })}\n\n`,
      { status: 400, headers: SSE_HEADERS },
    );
  }
  const jdText = (body.jdText ?? "").trim();
  if (!jdText) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", message: "jdText required" })}\n\n`,
      { status: 400, headers: SSE_HEADERS },
    );
  }

  // Stage the JD on disk so the agent can `cat` it if it wants.
  await mkdir(JDS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const jdPath = join(JDS_DIR, `web-${ts}.txt`);
  const header = body.sourceUrl ? `Source URL: ${body.sourceUrl}\n\n` : "";
  await writeFile(jdPath, `${header}${jdText}\n`, "utf-8");

  const prompt = buildEvalPrompt(jdText, body.sourceUrl);
  const args = [
    "-p",
    "--force",
    "--trust",
    "--workspace",
    REPO_ROOT,
  ];
  if (body.model) args.push("--model", body.model);
  args.push(prompt);

  const stream = streamProcess("cursor-agent", args);
  return new Response(stream, { headers: SSE_HEADERS });
}
