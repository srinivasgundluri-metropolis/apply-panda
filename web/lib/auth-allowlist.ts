export function parseAllowedEmails(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(/[,\n]/)
      .map((v) => v.trim().toLowerCase())
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

