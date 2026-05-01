/**
 * Detects imperative résumé edit requests so chat can route to the coach
 * apply pipeline without requiring the coach checkbox.
 */

/** True when the user is asking to change persisted résumé markdown, not a how/what question. */
export function isExplicitCvMarkdownEditRequest(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^\s*(how|what|why|when|where|explain|describe|summarize|show|tell|walk|compare|list)\b/i.test(t)) {
    return false;
  }
  if (/\?\s*$/.test(t)) return false;

  const lower = t.toLowerCase();
  const hasCvTarget =
    /\bcv\.md\b|\bcanonical\s+r[ée]sum[ée]\b|\bmy\s+cv\b|\bmy\s+r[ée]sum[ée]\b|\bmy\s+resume\b/i.test(
      lower,
    );
  const hasVerb =
    /\b(update|edit|rewrite|revise|change|fix|replace|shorten|expand|trim|polish|reword|tweak|add\s+to|remove\s+from)\b/i.test(
      lower,
    );
  if (hasCvTarget && hasVerb) return true;

  if (
    /\b(please\s+)?(update|edit|rewrite|revise|change|fix)\s+(the\s+)?(summary|skills|experience|education|header)\b/i.test(
      lower,
    ) &&
    /\b(in|on)\s+(my\s+)?(cv|r[ée]sum[ée]|cv\.md)\b/i.test(lower)
  ) {
    return true;
  }

  return false;
}
