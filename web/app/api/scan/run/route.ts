import { streamProcess, SSE_HEADERS } from "@/lib/shell";
import { SCRIPT_SCAN } from "@/lib/paths";
import { requireApiUser } from "@/lib/supabase/api";

export const dynamic = "force-dynamic";

/**
 * Streams `node scan.mjs` line-by-line as SSE. Triggers a portal scan that
 * appends new offers to data/scan-history.tsv and data/pipeline.md. Use
 * `GET` because EventSource is GET-only and we have no body to pass.
 */
export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const stream = streamProcess("node", [SCRIPT_SCAN]);
  return new Response(stream, { headers: SSE_HEADERS });
}
