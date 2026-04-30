/**
 * Shared Generative Language API (Gemini) HTTP calls with retry on overload.
 * 429/503 often clear after a short wait; free-tier keys hit RPM limits quickly.
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const maxRetries = options?.maxRetries ?? 4;

  let last: Response | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    last = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (last.ok) return last;

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
      "Gemini quota or rate limit (429). This uses Google's API directly — not Cursor. " +
      "Wait a few minutes and try again; avoid firing many Gemini features at once (outreach draft, résumé coach); " +
      "or enable billing / a higher tier in Google AI Studio (https://aistudio.google.com/apikey). " +
      (raw ? `Details: ${raw}` : "")
    );
  }
  if (status === 503) {
    return `Gemini temporarily unavailable (503). Retry in a moment. ${raw}`;
  }
  return `Gemini request failed (${status}): ${raw || "(no body)"}`;
}
