export function parseAllowedEmails(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  const normalizedRaw = raw.trim().replace(/^['"]|['"]$/g, "");
  return new Set(
    normalizedRaw
      .split(/[,\n;]/)
      .map((v) => v.trim().replace(/^['"]|['"]$/g, "").toLowerCase())
      .filter(Boolean),
  );
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  const allowed = parseAllowedEmails(process.env.APPLYPANDA_ALLOWED_EMAILS);
  if (allowed.size === 0) return true;
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return allowed.has(normalized);
}

