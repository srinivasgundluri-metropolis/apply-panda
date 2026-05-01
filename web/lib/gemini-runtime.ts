import { SSE_HEADERS } from "@/lib/shell";
import { geminiGenerateContent, formatGeminiHttpError } from "@/lib/gemini-generate";
import { resolveGeminiApiKey } from "@/lib/outreach-mail";

function parseFallbackModels(): string[] {
  const raw =
    process.env.OPENAI_FALLBACK_MODELS ??
    process.env.GEMINI_FALLBACK_MODELS ??
    "gpt-4.1-mini";
  return raw
    .split(/[,\n;]/)
    .map((m) => m.trim())
    .filter(Boolean);
}

function parseGeminiText(data: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}) {
  return (
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? ""
  ).trim();
}

export async function runGeminiPrompt(
  prompt: string,
  model = process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
) {
  return runGeminiPromptWithConfig(prompt, model, {
    temperature: 0.35,
    maxOutputTokens: 8192,
  });
}

export async function runGeminiPromptWithConfig(
  prompt: string,
  model = process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
  config: { temperature?: number; maxOutputTokens?: number } = {},
) {
  return runGeminiPromptWithFallback(prompt, model, config);
}

export async function runGeminiPromptWithFallback(
  prompt: string,
  model =
    process.env.OPENAI_MODEL?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    "gpt-4.1-mini",
  config: { temperature?: number; maxOutputTokens?: number } = {},
) {
  const apiKey = await resolveGeminiApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set in environment.");
  }
  const temperature = config.temperature ?? 0.35;
  const maxOutputTokens = config.maxOutputTokens ?? 8192;
  const fallbacks = parseFallbackModels().filter((m) => m !== model);
  const modelsToTry = [model, ...fallbacks];
  let lastError: Error | null = null;

  for (const modelName of modelsToTry) {
    const res = await geminiGenerateContent(modelName, apiKey, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const msg = formatGeminiHttpError(res.status, body);
      const retryable = res.status === 429 || res.status === 503;
      if (retryable && modelName !== modelsToTry[modelsToTry.length - 1]) {
        lastError = new Error(`${msg} (attempted model: ${modelName})`);
        continue;
      }
      throw new Error(`${msg} (model: ${modelName})`);
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = parseGeminiText(json);
    if (!text) {
      lastError = new Error(`LLM returned empty output (model: ${modelName}).`);
      continue;
    }
    return text;
  }

  throw lastError ?? new Error("LLM request failed across all configured models.");
}

export function sseFromText(text: string, exitCode: number = 0) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const line of text.split(/\r?\n/)) {
        controller.enqueue(
          enc.encode(`data: ${JSON.stringify({ type: "stdout", data: line })}\n\n`),
        );
      }
      controller.enqueue(
        enc.encode(`data: ${JSON.stringify({ type: "done", exitCode })}\n\n`),
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

