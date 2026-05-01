/**
 * Guardrails for job-posting URLs coming from model output or user input.
 * We allow normal http(s) links but explicitly reject obvious placeholder
 * LinkedIn URLs that models tend to fabricate in examples.
 */

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function isPlaceholderLinkedInJobUrl(value: string): boolean {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  if (!host.endsWith("linkedin.com")) return false;
  const match = u.pathname.match(/\/jobs\/view\/(\d+)/i);
  if (!match) return false;
  // Known fake sequence pattern from model examples/screenshots.
  return /^123456789\d*$/.test(match[1]);
}

export function hasLinkedInJobIdUrl(value: string): boolean {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  if (!host.endsWith("linkedin.com")) return false;
  return /\/jobs\/view\/\d+/i.test(u.pathname);
}

export function isUsableJobUrl(value: string): boolean {
  const v = value.trim();
  if (!v || !isHttpUrl(v) || isPlaceholderLinkedInJobUrl(v)) return false;
  try {
    const u = new URL(v);
    if (u.hostname.toLowerCase().endsWith("linkedin.com")) {
      return hasLinkedInJobIdUrl(v);
    }
  } catch {
    return false;
  }
  return true;
}

export function sanitizePlaceholderLinkedInUrls(text: string): string {
  return text.replace(
    /https?:\/\/(?:www\.)?linkedin\.com\/jobs\/view\/123456789\d*[^\s)"]*/gi,
    "[invalid placeholder URL removed]",
  );
}
