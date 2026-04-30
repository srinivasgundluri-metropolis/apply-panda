/**
 * Fetch + clean job descriptions from a URL. Mirrors the Python
 * `fetch_job_description` helper but uses native fetch + a tiny HTML
 * stripper to avoid pulling in a full DOM library on the server.
 *
 * The cleaning is intentionally light:
 *   1. Strip <script>, <style>, <nav>, <footer>, <header> blocks.
 *   2. Prefer the contents of <main> or <article> if present.
 *   3. Replace tags with newlines, decode entities, collapse whitespace.
 *
 * That's good enough for the evaluation prompt to read — Cursor Agent
 * sees the raw text and pulls structured details from it.
 */

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const STRIP_TAGS_RE = /<(script|style|nav|footer|header|noscript)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi;
const TAG_RE = /<\/?[^>]+>/g;
const MAIN_RE = /<main\b[^>]*>([\s\S]*?)<\/main>/i;
const ARTICLE_RE = /<article\b[^>]*>([\s\S]*?)<\/article>/i;
const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

function stripHtml(html: string): string {
  let body = html;
  // Prefer the most informative subtree if present.
  const mainMatch = body.match(MAIN_RE);
  if (mainMatch) body = mainMatch[1];
  else {
    const articleMatch = body.match(ARTICLE_RE);
    if (articleMatch) body = articleMatch[1];
  }
  body = body.replace(STRIP_TAGS_RE, " ");
  body = body.replace(/<br\s*\/?>(\s*)/gi, "\n");
  body = body.replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n");
  body = body.replace(TAG_RE, " ");
  body = decodeEntities(body);
  body = body
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return body;
}

export interface FetchJdResult {
  ok: boolean;
  text: string;
  /** Raw HTTP error (when ok=false). */
  error?: string;
}

export async function fetchJobDescription(
  url: string,
  timeoutMs = 15_000,
): Promise<FetchJdResult> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, text: "", error: "Invalid URL" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!resp.ok) {
      return {
        ok: false,
        text: "",
        error: `HTTP ${resp.status} ${resp.statusText}`,
      };
    }
    const html = await resp.text();
    const text = stripHtml(html);
    if (!text.trim()) {
      return {
        ok: false,
        text: "",
        error: "Empty body after HTML strip — page likely needs a real browser.",
      };
    }
    return { ok: true, text };
  } catch (e) {
    clearTimeout(timer);
    return {
      ok: false,
      text: "",
      error: (e as Error).message || "fetch failed",
    };
  }
}
