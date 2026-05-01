import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/api";
import {
  HOSTED_SCAN_MATCH_LIMIT,
  loadPortalsConfigResolved,
  searchPortalJobsWithFilters,
  UserPortalsConfigMissingError,
} from "@/lib/portal-scan";
import type { LinkedInResult, PortalSearchResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

interface SearchBody {
  keywords?: string;
  limit?: number;
}

function toResults(
  jobs: Array<{
    url: string;
    title: string;
    company: string;
    location: string;
    source: string;
    postedAt?: number;
  }>,
): LinkedInResult[] {
  return jobs.map((j) => ({
    url: j.url,
    title: j.title,
    company: j.company,
    location: j.location ?? "",
    posted:
      typeof j.postedAt === "number" && Number.isFinite(j.postedAt)
        ? new Date(j.postedAt).toISOString()
        : "",
    source: j.source,
  }));
}

/**
 * Job search for chat: same engine as Pipeline scan (curated ATS boards).
 * Filters come from per-user `profiles.data.portals`; optional keywords narrow titles. Read-only (no scan_history writes).
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  let body: SearchBody;
  try {
    body = (await req.json()) as SearchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const keywords = String(body.keywords ?? "").trim();
  const limit = Math.min(
    HOSTED_SCAN_MATCH_LIMIT,
    Math.max(1, Number(body.limit) || HOSTED_SCAN_MATCH_LIMIT),
  );

  try {
    const cfg = await loadPortalsConfigResolved(auth.supabase, auth.user.id);
    const { config, companiesScanned, jobs, titleFilteredTotal, keywordMatchedTotal } =
      await searchPortalJobsWithFilters(cfg, keywords, limit);
    const tf = config.title_filter ?? {};
    const lf = config.location_filter ?? {};
    const cf =
      typeof config.company_filter === "string" && config.company_filter.trim()
        ? config.company_filter.trim()
        : undefined;
    const payload: PortalSearchResponse = {
      query: { keywords, limit, ...(cf ? { company_filter: cf } : {}) },
      title_filter: {
        positive: tf.positive ?? [],
        negative: tf.negative ?? [],
      },
      location_filter: {
        positive: lf.positive ?? [],
        negative: lf.negative ?? [],
      },
      companies_scanned: companiesScanned,
      stats: {
        title_filtered_total: titleFilteredTotal,
        keyword_matched_total: keywordMatchedTotal,
        returned: jobs.length,
      },
      results: toResults(jobs),
    };
    return NextResponse.json(payload);
  } catch (e) {
    if (e instanceof UserPortalsConfigMissingError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
