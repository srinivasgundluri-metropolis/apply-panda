import {
  Briefcase,
  CheckCircle2,
  ClipboardCheck,
  Search,
  Sparkles,
  Star,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-cards";
import { FunnelChart } from "@/components/dashboard/funnel-chart";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { readApplications } from "@/lib/parse-applications";
import { readScanHistory } from "@/lib/scan-history";
import { listReports } from "@/lib/parse-reports";
import { readProfile, candidateFullName, candidateFirstName } from "@/lib/profile";
import { candidateSlug } from "@/lib/slugify";
import { CANONICAL_STATES } from "@/lib/types";
import { extractReportNumFromRelPath, formatDate } from "@/lib/utils";
import Link from "next/link";
import { ViewReportButton } from "@/components/report/view-report-button";

// Always render fresh — applications.md and scan-history.tsv mutate while
// the user is in the dashboard, and stale numbers are worse than a slower
// first paint.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const profile = await readProfile();
  const slug = candidateSlug(candidateFullName(profile));
  const [apps, scan, reports] = await Promise.all([
    readApplications(slug),
    readScanHistory(),
    listReports(),
  ]);

  const first = candidateFirstName(profile);

  // Aggregate stats — the funnel maps canonical states to counts, while
  // the KPI cards surface the headline numbers.
  const statusCounts = new Map<string, number>();
  for (const a of apps) {
    statusCounts.set(a.status, (statusCounts.get(a.status) ?? 0) + 1);
  }
  const evaluated = statusCounts.get("Evaluated") ?? 0;
  const applied = statusCounts.get("Applied") ?? 0;
  const interview = statusCounts.get("Interview") ?? 0;
  const offer = statusCounts.get("Offer") ?? 0;
  const rejected = statusCounts.get("Rejected") ?? 0;

  const scoredApps = apps.filter((a) => a.scoreValue !== null);
  const avgScore =
    scoredApps.length > 0
      ? scoredApps.reduce((acc, a) => acc + (a.scoreValue ?? 0), 0) /
        scoredApps.length
      : null;

  const newScans = scan.filter((s) => s.status === "added").length;

  const funnelData = CANONICAL_STATES.map((stage) => ({
    stage,
    count: statusCounts.get(stage) ?? 0,
  }));

  // Recent activity = newest 5 reports + most recent scan additions.
  const recentReports = reports.slice(0, 5);
  const recentScans = [...scan]
    .sort((a, b) => (b.firstSeen ?? "").localeCompare(a.firstSeen ?? ""))
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title={first ? `${first}'s dashboard` : "Status Dashboard"}
        description="A live view of your job search funnel. Numbers are computed from applications.md, scan-history.tsv, and reports/."
      />

      <div className="px-8 py-6 flex flex-col gap-6">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Total applications"
            value={apps.length}
            hint={`${evaluated} evaluated · ${applied} applied`}
            icon={Briefcase}
            accent="violet"
          />
          <KpiCard
            label="Active interviews"
            value={interview + offer}
            hint={`${interview} in process · ${offer} offers`}
            icon={ClipboardCheck}
            accent="emerald"
          />
          <KpiCard
            label="Average score"
            value={avgScore !== null ? `${avgScore.toFixed(1)} / 5` : "—"}
            hint={`${scoredApps.length} scored offers`}
            icon={Star}
            accent="amber"
          />
          <KpiCard
            label="New scan results"
            value={newScans}
            hint={`${scan.length} total in scan history`}
            icon={Search}
            accent="sky"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              Conversion funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            {apps.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No applications yet — paste a JD on the{" "}
                <Link
                  href="/pipeline"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Pipeline
                </Link>{" "}
                page to evaluate your first role.
              </p>
            ) : (
              <FunnelChart data={funnelData} />
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-500" />
                Recent evaluations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentReports.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No reports yet.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {recentReports.map((r) => {
                    const reportNum = extractReportNumFromRelPath(r.relPath);
                    return (
                      <li
                        key={r.path}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{r.company}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {r.role}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                          {reportNum ? (
                            <ViewReportButton
                              reportNum={reportNum}
                              variant="outline"
                              compact
                            />
                          ) : null}
                          {r.score !== null ? (
                            <Badge variant="secondary">
                              {r.score.toFixed(1)} / 5
                            </Badge>
                          ) : null}
                          {r.legitimacy ? (
                            <Badge variant="outline" className="text-[10px]">
                              {r.legitimacy.split(" ").slice(0, 2).join(" ")}
                            </Badge>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="size-4 text-rose-500" />
                Recent scan additions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentScans.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Scan history is empty. Run a scan from the{" "}
                  <Link
                    href="/pipeline"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Pipeline
                  </Link>{" "}
                  page.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {recentScans.map((s) => (
                    <li
                      key={s.url}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{s.company}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {s.title}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant={
                            s.status === "Evaluated" ? "success" : "outline"
                          }
                          className="text-[10px]"
                        >
                          {s.status || "added"}
                        </Badge>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatDate(s.firstSeen)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Status breakdown</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Array.from(statusCounts.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([status, count]) => (
                <Badge
                  key={status}
                  variant="outline"
                  className="px-3 py-1 text-xs"
                >
                  {status} <span className="ml-2 tabular-nums">{count}</span>
                </Badge>
              ))}
            {statusCounts.size === 0 ? (
              <span className="text-sm text-muted-foreground">
                No applications recorded yet.
              </span>
            ) : null}
            <Badge variant="secondary" className="px-3 py-1 text-xs">
              Rejected <span className="ml-2 tabular-nums">{rejected}</span>
            </Badge>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
