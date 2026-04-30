import { NextRequest } from "next/server";
import { streamProcess, SSE_HEADERS } from "@/lib/shell";
import { buildChatPrompt } from "@/lib/prompts";
import { readProfile, candidateFirstName } from "@/lib/profile";

export const dynamic = "force-dynamic";

/**
 * Streams cursor-agent's response to a chat prompt. The agent runs in
 * default print-mode (`-p`) with the workspace pinned to REPO_ROOT so it
 * can shell out to scrape-linkedin.mjs / add-to-scan.mjs. The prompt
 * itself encodes hard rules forbidding other writes.
 *
 * Body shape:
 *   { message: string, history: [{role, content}, ...], model?: string }
 *
 * The client reconstructs the assistant message by concatenating every
 * `stdout` event. A final `done` event carries the cursor-agent exit code.
 */
export async function POST(req: NextRequest) {
  let body: {
    message?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
    model?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(
      `data: ${JSON.stringify({ type: "error", message: "Invalid JSON" })}\n\n`,
      { status: 400, headers: SSE_HEADERS },
    );
  }
  const message = (body.message ?? "").trim();
  if (!message) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", message: "Empty message" })}\n\n`,
      { status: 400, headers: SSE_HEADERS },
    );
  }

  const profile = await readProfile();
  const first = candidateFirstName(profile);
  const prompt = buildChatPrompt(message, body.history ?? [], first);

  const args = [
    "-p",
    "--force",
    "--trust",
  ];
  if (body.model) args.push("--model", body.model);
  args.push(prompt);

  const stream = streamProcess("cursor-agent", args);
  return new Response(stream, { headers: SSE_HEADERS });
}
