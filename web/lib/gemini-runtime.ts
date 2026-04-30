import { SSE_HEADERS } from "@/lib/shell";
import { geminiGenerateContent, formatGeminiHttpError } from "@/lib/gemini-generate";
import { resolveGeminiApiKey } from "@/lib/outreach-mail";

function parseGeminiText(data: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}) {
  return (
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? ""
  ).trim();
}

export async function runGeminiPrompt(prompt: string, model = "gemini-2.0-flash") {
  const apiKey = await resolveGeminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in environment.");
  }
  const res = await geminiGenerateContent(model, apiKey, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.35, maxOutputTokens: 8192 },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(formatGeminiHttpError(res.status, body));
  }
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = parseGeminiText(json);
  if (!text) throw new Error("Gemini returned empty output.");
  return text;
}

export function sseFromText(text: string) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const line of text.split(/\r?\n/)) {
        controller.enqueue(
          enc.encode(`data: ${JSON.stringify({ type: "stdout", data: line })}\n\n`),
        );
      }
      controller.enqueue(
        enc.encode(`data: ${JSON.stringify({ type: "done", exitCode: 0 })}\n\n`),
      );
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

export function sseError(message: string, status = 400) {
  return new Response(
    `data: ${JSON.stringify({ type: "error", message })}\n\n`,
    { status, headers: SSE_HEADERS },
  );
}

