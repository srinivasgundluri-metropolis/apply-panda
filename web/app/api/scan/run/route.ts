import { SSE_HEADERS } from "@/lib/shell";
import { requireApiUser } from "@/lib/supabase/api";
import {
  collectAllTitleFilteredPortalJobs,
  loadPortalsConfigResolved,
} from "@/lib/portal-scan";

export const dynamic = "force-dynamic";

/**
 * Streams portal scan progress as SSE, persists new rows to scan_history.
 * Uses Greenhouse/Ashby/Lever APIs + per-user `profiles.data.portals` only (no generic bundled list).
 */
export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      const send = (type: "stdout" | "stderr" | "done" | "error", payload: string | number) => {
        const data =
          type === "done"
            ? { type, exitCode: Number(payload) }
            : type === "error"
              ? { type, message: String(payload) }
              : { type, data: String(payload) };
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      (async () => {
        try {
          send("stdout", "Loading portal configuration…");
          const cfg = await loadPortalsConfigResolved(auth.supabase, auth.user.id);
          send("stdout", "Fetching ATS boards…");
          const { jobs: candidates, companiesScanned } =
            await collectAllTitleFilteredPortalJobs(cfg);
          send("stdout", `Boards queried: ${companiesScanned} · listings after title filter: ${candidates.length}`);

          const { data: existingRows, error: existingErr } = await auth.supabase
            .from("scan_history")
            .select("url")
            .eq("user_id", auth.user.id);
          if (existingErr) throw existingErr;
          const seen = new Set((existingRows ?? []).map((r) => String(r.url ?? "")));

          const toInsert = candidates.filter((j) => j.url && !seen.has(j.url));

          if (toInsert.length > 0) {
            const now = new Date().toISOString();
            const rows = toInsert.map((j) => ({
              user_id: auth.user.id,
              url: j.url,
              first_seen: now,
              portal: j.source,
              title: j.title,
              company: j.company,
              status: "added",
            }));
            const { error: insertErr } = await auth.supabase.from("scan_history").insert(rows);
            if (insertErr) throw insertErr;
          }

          send("stdout", `New offers added to scan history: ${toInsert.length}`);
          send("done", 0);
        } catch (e) {
          send("error", (e as Error).message);
          send("done", 1);
        } finally {
          controller.close();
        }
      })();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
