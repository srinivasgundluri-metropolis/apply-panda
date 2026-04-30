import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/api";
import { searchPortalJobsWithFilters } from "@/lib/portal-scan";
import type { LinkedInResult, PortalSearchResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

interface SearchBody {
  keywords?: string;
  limit?: number;
}

function toResults(jobs: Array<{ url: string; title: string; company: string; location: string; source: string }>): LinkedInResult[] {
  return jobs.map((j) => ({
    url: j.url,
    title: j.title,
    company: j.company,
    location: j.location ?? "",
    posted: "",
    source: j.source,
  }));
}

/**
 * Live portal job search — titles filtered by portals.yml rules, optional keywords narrow company/title/location.
 * Read-only (does not write scan_history).
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
  const limit = Math.min(200, Math.max(1, Number(body.limit) || 60));

  try {
    const { config, companiesScanned, jobs, titleFilteredTotal, keywordMatchedTotal } =
      await searchPortalJobsWithFilters(keywords, limit);
    const tf = config.title_filter ?? {};
    const payload: PortalSearchResponse = {
      query: { keywords, limit },
      title_filter: {
        positive: tf.positive ?? [],
        negative: tf.negative ?? [],
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
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
