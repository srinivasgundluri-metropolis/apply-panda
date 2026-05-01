/** Human-readable PostgREST / GoTrue errors for API responses. */
export function formatPostgrestError(
  err: { message?: string; details?: string | null; hint?: string | null; code?: string | null } | null,
  fallback = "Database error",
): string {
  if (!err) return fallback;
  const parts = [
    err.message,
    err.details,
    err.hint,
    err.code ? `[${err.code}]` : null,
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(" — ") : fallback;
}
