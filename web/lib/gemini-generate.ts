/**
 * Shared OpenAI Responses API calls with retry on overload.
 * Maintains a Gemini-like response shape for existing call sites.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * POST `generateContent` for a model. Retries on 429 and 503 with exponential backoff.
 */
export async function geminiGenerateContent(
  model: string,
  apiKey: string,
  requestBody: Record<string, unknown>,
  options?: { maxRetries?: number },
): Promise<Response> {
  const url = "https://api.openai.com/v1/responses";
  const maxRetries = options?.maxRetries ?? 4;
  const contents = requestBody.contents as
    | Array<{ parts?: Array<{ text?: string }> }>
    | undefined;
  const prompt = contents?.[0]?.parts?.[0]?.text ?? "";
  const gen = (requestBody.generationConfig ?? {}) as {
    temperature?: number;
    maxOutputTokens?: number;
  };
  const requestedFormat =
    (requestBody.response_format as Record<string, unknown> | undefined) ?? undefined;
  const responseTextFormat = (() => {
    if (!requestedFormat) return undefined;
    const type = requestedFormat.type;
    if (type === "json_schema") {
      const nested = requestedFormat.json_schema as
        | { name?: unknown; schema?: unknown }
        | undefined;
      const name = String(nested?.name ?? "").trim();
      const schema = nested?.schema;
      if (name && schema && typeof schema === "object") {
        return { type: "json_schema", name, schema };
      }
    }
    return requestedFormat;
  })();
  const body = {
    model,
    input: prompt,
    temperature: gen.temperature ?? 0.35,
    max_output_tokens: gen.maxOutputTokens ?? 2048,
    text: responseTextFormat ? { format: responseTextFormat } : undefined,
  };

  let last: Response | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    last = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (last.ok) {
      const json = (await last.json()) as {
        output_text?: string;
        output?: Array<{
          content?: Array<{ type?: string; text?: string }>;
        }>;
      };
      const outputText =
        json.output_text?.trim() ||
        json.output
          ?.flatMap((o) => o.content ?? [])
          .filter((c) => c.type === "output_text" || typeof c.text === "string")
          .map((c) => c.text ?? "")
          .join("")
          .trim() ||
        "";
      const compat = {
        candidates: [
          {
            content: {
              parts: [{ text: outputText }],
            },
          },
        ],
      };
      return new Response(JSON.stringify(compat), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const retryLater = last.status === 429 || last.status === 503;
    if (retryLater && attempt < maxRetries) {
      const base = Math.min(32_000, 1000 * 2 ** attempt);
      await sleep(base + Math.random() * 500);
      continue;
    }

    return last;
  }

  return last!;
}

/** User-facing explanation for failed Gemini HTTP responses. */
export function formatGeminiHttpError(status: number, bodySnippet: string): string {
  const raw = bodySnippet.trim().slice(0, 400);
  if (status === 429) {
    return (
      "OpenAI/Codex quota or rate limit (429). " +
      "Wait a few minutes and retry one request at a time; " +
      "or increase your OpenAI project limits/billing tier. " +
      (raw ? `Details: ${raw}` : "")
    );
  }
  if (status === 503) {
    return `OpenAI/Codex temporarily unavailable (503). Retry in a moment. ${raw}`;
  }
  return `OpenAI/Codex request failed (${status}): ${raw || "(no body)"}`;
}
