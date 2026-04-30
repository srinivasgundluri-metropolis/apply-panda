import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { REPO_ROOT } from "@/lib/paths";
import { SSE_HEADERS } from "@/lib/shell";
import { requireApiUser } from "@/lib/supabase/api";

export const dynamic = "force-dynamic";

type PortalJob = {
  title: string;
  url: string;
  company: string;
  location: string;
  source: string;
};

function detectApi(company: { api?: string; careers_url?: string }) {
  if (company.api && company.api.includes("greenhouse")) {
    return { type: "greenhouse" as const, url: company.api };
  }
  const url = company.careers_url ?? "";
  const ashby = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
  if (ashby) {
    return {
      type: "ashby" as const,
      url: `https://api.ashbyhq.com/posting-api/job-board/${ashby[1]}?includeCompensation=true`,
    };
  }
  const lever = url.match(/jobs\.lever\.co\/([^/?#]+)/);
  if (lever) {
    return { type: "lever" as const, url: `https://api.lever.co/v0/postings/${lever[1]}` };
  }
  const gh = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/);
  if (gh) {
    return {
      type: "greenhouse" as const,
      url: `https://boards-api.greenhouse.io/v1/boards/${gh[1]}/jobs`,
    };
  }
  return null;
}

function parseGreenhouse(json: unknown, companyName: string): PortalJob[] {
  const jobs = (json as { jobs?: Array<{ title?: string; absolute_url?: string; location?: { name?: string } }> })
    .jobs ?? [];
  return jobs.map((j) => ({
    title: j.title ?? "",
    url: j.absolute_url ?? "",
    company: companyName,
    location: j.location?.name ?? "",
    source: "greenhouse-api",
  }));
}

function parseAshby(json: unknown, companyName: string): PortalJob[] {
  const jobs = (json as { jobs?: Array<{ title?: string; jobUrl?: string; location?: string }> }).jobs ?? [];
  return jobs.map((j) => ({
    title: j.title ?? "",
    url: j.jobUrl ?? "",
    company: companyName,
    location: j.location ?? "",
    source: "ashby-api",
  }));
}

function parseLever(json: unknown, companyName: string): PortalJob[] {
  const jobs = Array.isArray(json) ? json : [];
  return jobs.map((j) => ({
    title: String((j as { text?: string }).text ?? ""),
    url: String((j as { hostedUrl?: string }).hostedUrl ?? ""),
    company: companyName,
    location: String((j as { categories?: { location?: string } }).categories?.location ?? ""),
    source: "lever-api",
  }));
}

function buildTitleFilter(titleFilter: { positive?: string[]; negative?: string[] } | undefined) {
  const positive = (titleFilter?.positive ?? []).map((k) => k.toLowerCase());
  const negative = (titleFilter?.negative ?? []).map((k) => k.toLowerCase());
  return (title: string) => {
    const lower = title.toLowerCase();
    const hasPositive = positive.length === 0 || positive.some((k) => lower.includes(k));
    const hasNegative = negative.some((k) => lower.includes(k));
    return hasPositive && !hasNegative;
  };
}

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
          const portalsPath = join(REPO_ROOT, "portals.yml");
          const raw = await readFile(portalsPath, "utf-8");
          const parsed = parseYaml(raw) as {
            tracked_companies?: Array<{ name?: string; enabled?: boolean; api?: string; careers_url?: string }>;
            title_filter?: { positive?: string[]; negative?: string[] };
          };
          const companies = parsed.tracked_companies ?? [];
          const targets = companies
            .filter((c) => c.enabled !== false)
            .map((c) => ({ ...c, _api: detectApi(c) }))
            .filter((c) => c._api !== null);

          send("stdout", `Scanning ${targets.length} companies via APIs`);

          const titleFilter = buildTitleFilter(parsed.title_filter);
          const { data: existingRows, error: existingErr } = await auth.supabase
            .from("scan_history")
            .select("url")
            .eq("user_id", auth.user.id);
          if (existingErr) throw existingErr;
          const seenUrls = new Set((existingRows ?? []).map((r) => String(r.url ?? "")));
          const added: PortalJob[] = [];

          for (const c of targets) {
            const api = c._api!;
            try {
              const res = await fetch(api.url);
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const json = (await res.json()) as unknown;
              const jobs =
                api.type === "greenhouse"
                  ? parseGreenhouse(json, c.name ?? "")
                  : api.type === "ashby"
                    ? parseAshby(json, c.name ?? "")
                    : parseLever(json, c.name ?? "");
              for (const j of jobs) {
                if (!j.url || !titleFilter(j.title) || seenUrls.has(j.url)) continue;
                seenUrls.add(j.url);
                added.push(j);
              }
              send("stdout", `${c.name}: ${jobs.length} jobs fetched`);
            } catch (e) {
              send("stderr", `${c.name}: ${(e as Error).message}`);
            }
          }

          if (added.length > 0) {
            const now = new Date().toISOString();
            const rows = added.map((j) => ({
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

          send("stdout", `New offers added: ${added.length}`);
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
