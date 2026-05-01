import type { SupabaseClient } from "@supabase/supabase-js";

/** Machine-readable footer block expected from `/api/eval/stream` prompts. */
const META_BLOCK_RE = /<<<EVAL_META\s*\r?\n([\s\S]*?)\r?\n>>>/;

export type ParsedEvalMeta = {
  company: string;
  role: string;
  score: number;
  legitimacy: string;
  recommendation: string;
  notes: string;
};

function clampScore(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(n)) return 3;
  return Math.round(Math.min(5, Math.max(0, n)) * 10) / 10;
}

function normalizeLegitimacy(raw: unknown): string {
  const s = String(raw ?? "").toLowerCase().trim();
  if (["strong", "moderate", "weak", "unknown"].includes(s)) return s;
  return "unknown";
}

function slugifyEmployer(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "company"
  );
}

/**
 * Removes the <<<EVAL_META ... >>> footer and returns trimmed display markdown plus optional JSON payload.
 */
export function splitEvalResponse(full: string): {
  displayMarkdown: string;
  metaJson: Record<string, unknown> | null;
} {
  const m = full.match(META_BLOCK_RE);
  if (!m || m.index === undefined) {
    return { displayMarkdown: full.trim(), metaJson: null };
  }
  const displayMarkdown = full.slice(0, m.index).trim();
  try {
    const parsed = JSON.parse(m[1].trim()) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { displayMarkdown, metaJson: parsed as Record<string, unknown> };
    }
  } catch {
    /* malformed JSON inside block */
  }
  return { displayMarkdown, metaJson: null };
}

function inferPartialMetaFromMarkdown(
  md: string,
  sourceUrl?: string | null,
): Partial<ParsedEvalMeta> {
  const out: Partial<ParsedEvalMeta> = {};
  const heading = md.match(/^#\s+(.+)$/m);
  if (heading) {
    const rest = heading[1].replace(/\*{2}/g, "").trim();
    const sep = /\s+[–\-—:|]\s+/.exec(rest);
    if (sep && sep.index != null && sep.index > 0) {
      out.company = rest.slice(0, sep.index).trim();
      out.role = rest.slice(sep.index + sep[0].length).trim();
    } else {
      out.company = rest;
    }
  }
  const scoreM = md.match(/\b(\d(?:\.\d)?)\s*\/\s*5\b/i);
  if (scoreM) out.score = parseFloat(scoreM[1]);
  const recM = md.match(/\b(Apply|Skip)\b/i);
  if (recM) out.recommendation = recM[1].slice(0, 1).toUpperCase() + recM[1].slice(1).toLowerCase();
  const oneLine =
    md.split(/\r?\n/).find((ln) => {
      const t = ln.trim();
      return t.startsWith("- ") && t.length > 4 && t.length < 200;
    }) ?? "";
  if (oneLine) out.notes = oneLine.replace(/^\-\s*/, "").trim();
  if (sourceUrl?.trim())
    try {
      const host = new URL(sourceUrl.trim()).hostname.replace(/^www\./, "");
      if (!heading && host) out.company = out.company ?? host.split(".")[0] ?? "";
    } catch {
      /* ignore */
    }
  return out;
}

function metaFromJson(
  j: Record<string, unknown>,
): Partial<ParsedEvalMeta> {
  const company = typeof j.company === "string" ? j.company.trim() : undefined;
  const role = typeof j.role === "string" ? j.role.trim() : undefined;
  const notesRaw = typeof j.notes === "string" ? j.notes.trim() : "";
  const recommendation =
    typeof j.recommendation === "string" ? j.recommendation.trim() : undefined;

  return {
    company,
    role,
    score: j.score !== undefined ? clampScore(j.score) : undefined,
    legitimacy: normalizeLegitimacy(j.legitimacy),
    recommendation,
    notes: notesRaw,
  };
}

function normalizeRecommendation(raw: unknown, inferred?: string): string {
  const s = String(raw ?? inferred ?? "").trim();
  const firstWord = (s.split(/\s+/)[0] ?? "").toLowerCase();
  if (firstWord.startsWith("apply")) return "Apply";
  if (firstWord.startsWith("skip")) return "Skip";
  return "Review";
}

/** Merge LLM JSON, then fill gaps from heuristics. */
export function resolveEvalMeta(params: {
  displayMarkdown: string;
  metaJson: Record<string, unknown> | null;
  sourceUrl?: string | null;
}): ParsedEvalMeta {
  const inferred = inferPartialMetaFromMarkdown(
    params.displayMarkdown,
    params.sourceUrl,
  );
  const fromJson = params.metaJson ? metaFromJson(params.metaJson) : {};
  const recommendation = normalizeRecommendation(
    fromJson.recommendation,
    inferred.recommendation,
  );
  const company =
    fromJson.company?.trim() ||
    inferred.company?.trim() ||
    "Unknown company";
  const role = fromJson.role?.trim() || inferred.role?.trim() || "Unknown role";
  const score = clampScore(
    fromJson.score !== undefined ? fromJson.score : inferred.score ?? 3,
  );
  const legitimacy =
    typeof fromJson.legitimacy === "string" && fromJson.legitimacy
      ? fromJson.legitimacy
      : inferred.legitimacy ?? "unknown";
  const notes =
    (fromJson.notes ?? inferred.notes ?? "").slice(0, 2000).trim() ||
    `${recommendation} — see evaluation above.`;

  return {
    company,
    role,
    score,
    legitimacy: normalizeLegitimacy(legitimacy),
    recommendation,
    notes,
  };
}

export async function allocateNextTrackerNum(params: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<string> {
  const { supabase, userId } = params;
  const [{ data: repRows, error: e1 }, { data: appRows, error: e2 }] =
    await Promise.all([
      supabase.from("reports").select("num").eq("user_id", userId),
      supabase.from("applications").select("num").eq("user_id", userId),
    ]);
  if (e1) throw e1;
  if (e2) throw e2;
  let max = 0;
  for (const row of [...(repRows ?? []), ...(appRows ?? [])]) {
    const n = parseInt(String((row as { num?: string }).num ?? ""), 10);
    if (!Number.isNaN(n)) max = Math.max(max, n);
  }
  return String(max + 1).padStart(3, "0");
}

/** Inserts matching `reports` + `applications` rows (career-ops shape). */
export async function persistEvalToSupabase(params: {
  supabase: SupabaseClient;
  userId: string;
  sourceUrl?: string | null;
  displayMarkdown: string;
  meta: ParsedEvalMeta;
}): Promise<{ num: string }> {
  const { supabase, userId } = params;
  const num = await allocateNextTrackerNum({ supabase, userId });
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const slug = slugifyEmployer(params.meta.company);
  const path = `reports/${num}-${slug}-${dateStr}.md`;

  const headerLines = [
    `**Score:** ${params.meta.score.toFixed(1)}/5`,
    `**Recommendation:** ${params.meta.recommendation}`,
  ];
  if (params.sourceUrl?.trim()) headerLines.unshift(`**URL:** ${params.sourceUrl.trim()}`);
  if (params.meta.legitimacy)
    headerLines.push(`**Legitimacy:** ${params.meta.legitimacy}`);

  const bodyMd = `${headerLines.join("\n")}\n\n${params.displayMarkdown}`.trim();

  const reportRow = {
    user_id: userId,
    num,
    path,
    company: params.meta.company,
    role: params.meta.role,
    score: params.meta.score,
    legitimacy: params.meta.legitimacy,
    url: params.sourceUrl?.trim() || null,
    body_md: bodyMd,
    pdf_path: null,
  };

  const { error: er } = await supabase.from("reports").insert(reportRow);
  if (er) throw er;

  const appRow = {
    user_id: userId,
    num,
    date: dateStr,
    company: params.meta.company,
    role: params.meta.role,
    score: `${params.meta.score.toFixed(1)}/5`,
    status: "Evaluated",
    pdf: "❌",
    notes: params.meta.notes,
    source_url: params.sourceUrl?.trim() || null,
    report_num: num,
    report_path: path,
  };

  const { error: ea } = await supabase.from("applications").insert(appRow);
  if (ea) {
    await supabase.from("reports").delete().eq("user_id", userId).eq("num", num);
    throw ea;
  }

  if (params.sourceUrl?.trim()) {
    await supabase
      .from("scan_history")
      .update({ status: "Evaluated", updated_at: now.toISOString() })
      .eq("user_id", userId)
      .eq("url", params.sourceUrl.trim());
  }

  return { num };
}
