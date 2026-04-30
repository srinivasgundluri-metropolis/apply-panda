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

export function isUsableJobUrl(value: string): boolean {
  const v = value.trim();
  return Boolean(v) && isHttpUrl(v) && !isPlaceholderLinkedInJobUrl(v);
}
