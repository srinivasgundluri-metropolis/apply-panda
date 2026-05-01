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

function isAdzunaLandingUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return /(^|\.)adzuna\./i.test(u.hostname) && /\/land\/ad\//i.test(u.pathname);
  } catch {
    return false;
  }
}

function decodeAdzunaDestination(raw: string): string | null {
  try {
    const u = new URL(raw);
    const keys = ["url", "dest", "destination", "target", "redirect"];
    for (const k of keys) {
      const v = u.searchParams.get(k);
      if (!v) continue;
      const decoded = decodeURIComponent(v);
      if (/^https?:\/\//i.test(decoded)) return decoded;
      if (/^https?:\/\//i.test(v)) return v;
    }
  } catch {
    // noop
  }
  return null;
}

export interface FetchJdResult {
  ok: boolean;
  text: string;
  /** Raw HTTP error (when ok=false). */
  error?: string;
}

/** `https://jobs.ashbyhq.com/{slug}/{uuid}` posting pages — HTML is SPA shell; body comes from Ashby posting API. */
function parseAshbyJobPostingUrl(
  raw: string,
): { boardSlug: string; postingId: string } | null {
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.replace(/^www\./i, "");
    if (!/^jobs\.ashbyhq\.com$/i.test(host)) return null;
    const segments = u.pathname.replace(/^\//, "").split("/").filter(Boolean);
    if (segments.length < 2) return null;
    const [, maybeUuid] = segments;
    if (!/^[0-9a-f-]{36}$/i.test(maybeUuid)) return null;
    return { boardSlug: segments[0], postingId: maybeUuid.toLowerCase() };
  } catch {
    return null;
  }
}

/** Title-case hyphenated ATS slugs (“my-company”, “AlephAlpha” → readable label). */
function humanizeOrgSlug(boardSlug: string): string {
  return boardSlug
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) =>
      /^[a-z0-9.]+$/i.test(w)
        ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        : w,
    )
    .join(" ");
}

type AshbyJobBoardJob = Record<string, unknown>;

async function fetchAshbyPostingViaApi(params: {
  boardSlug: string;
  postingId: string;
  timeoutMs: number;
}): Promise<FetchJdResult> {
  const { boardSlug, postingId: normalizedPostingId } = params;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardSlug)}?includeCompensation=true`;
    const resp = await fetch(apiUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!resp.ok) {
      return {
        ok: false,
        text: "",
        error: `Ashby job board HTTP ${resp.status}: ${resp.statusText}`,
      };
    }
    const json = (await resp.json()) as { jobs?: AshbyJobBoardJob[] };
    const jobs = json.jobs ?? [];
    const job = jobs.find(
      (j) => String(j?.id ?? "").toLowerCase() === normalizedPostingId,
    );
    if (!job) {
      return {
        ok: false,
        text: "",
        error:
          `No Ashby posting ${normalizedPostingId} on board “${boardSlug}”. It may be unlisted, closed, or the URL slug may differ (try the careers page slug).`,
      };
    }

    const title = String(job.title ?? "").trim();
    const descriptionPlain = String(job.descriptionPlain ?? "").trim();
    const descriptionHtml = String(job.descriptionHtml ?? "");
    const body =
      descriptionPlain ||
      (descriptionHtml ? stripHtml(descriptionHtml) : "");

    if (!body) {
      return {
        ok: false,
        text: "",
        error: "Ashby posting has no description in the API response.",
      };
    }

    const orgLabel = humanizeOrgSlug(boardSlug);
    const department = String(job.department ?? "").trim();
    const team = String(job.team ?? "").trim();
    const location = String(job.location ?? "").trim();
    const employmentType = String(job.employmentType ?? "").trim();
    const workplaceType = String(job.workplaceType ?? "").trim();
    const isRemote = typeof job.isRemote === "boolean" ? job.isRemote : null;

    const metaLines: string[] = [
      `Company: ${orgLabel}`,
      `Title: ${title || "(no title)"}`,
    ];
    if (department) metaLines.push(`Department: ${department}`);
    if (team) metaLines.push(`Team: ${team}`);
    if (location) metaLines.push(`Location: ${location}`);
    if (employmentType) metaLines.push(`Employment type: ${employmentType}`);
    if (workplaceType)
      metaLines.push(`Workplace: ${workplaceType}${isRemote === true ? " · Remote-eligible" : ""}`);
    metaLines.push("");

    const text = `${metaLines.join("\n")}\n${body}`.trim();
    return { ok: true, text };
  } catch (e) {
    return {
      ok: false,
      text: "",
      error: (e as Error).message || "Ashby fetch failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJobDescription(
  url: string,
  timeoutMs = 15_000,
): Promise<FetchJdResult> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, text: "", error: "Invalid URL" };
  }
  const ashbyPosting = parseAshbyJobPostingUrl(url);
  if (ashbyPosting) {
    return fetchAshbyPostingViaApi({
      boardSlug: ashbyPosting.boardSlug,
      postingId: ashbyPosting.postingId,
      timeoutMs,
    });
  }
  if (isAdzunaLandingUrl(url)) {
    const decoded = decodeAdzunaDestination(url);
    if (decoded) {
      return fetchJobDescription(decoded, timeoutMs);
    }
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
      if (isAdzunaLandingUrl(url) && resp.status === 403) {
        return {
          ok: false,
          text: "",
          error:
            "Adzuna landing URL blocked server fetch (403). Re-run scan to capture destination URLs directly, then evaluate from those links.",
        };
      }
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
