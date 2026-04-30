import Link from "next/link";
import {
  ArrowRight,
  Bot,
  BarChart3,
  FileText,
  Search,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { readApplications } from "@/lib/parse-applications";
import { readScanHistory } from "@/lib/scan-history";
import { listReports } from "@/lib/parse-reports";
import { readProfile, candidateFirstName, candidateFullName } from "@/lib/profile";
import { candidateSlug } from "@/lib/slugify";

const FEATURES = [
  {
    icon: Bot,
    title: "AI Assistant",
    description:
      "Ask questions in plain English — search LinkedIn live, summarize reports, query your scan history. Inline buttons let you save jobs or trigger an evaluation in one click.",
  },
  {
    icon: Target,
    title: "A–G Evaluations",
    description:
      "Paste a JD or pick a scan result and the agent runs the full oferta pipeline: Playwright verification, structured A–F scoring, posting legitimacy, tracker write-back.",
  },
  {
    icon: FileText,
    title: "Tailored Documents",
    description:
      "Generate ATS-optimized CVs and cover letters per role — the agent reads each evaluation report to lift JD keywords + the detected archetype into the document.",
  },
  {
    icon: Search,
    title: "Portal Scanner",
    description:
      "Hits Greenhouse / Ashby / Lever / Workday public APIs directly with zero LLM cost. Filters offers by your target roles before they hit your tracker.",
  },
  {
    icon: BarChart3,
    title: "Status Dashboard",
    description:
      "KPI cards, conversion funnel, recent activity. See where every opportunity stands at a glance — no spreadsheet maintenance, just a live view of `applications.md`.",
  },
  {
    icon: Zap,
    title: "Streamlit + React",
    description:
      "The Python Streamlit dashboard and this Next.js app share the exact same backend (.mjs scripts, modes, templates). Use whichever surface fits your workflow.",
  },
];

export default async function LandingPage() {
  // Surface a few live KPIs so the landing isn't dead chrome — pulled at
  // request time so visiting the landing always reflects today's data.
  const profile = await readProfile();
  const slug = candidateSlug(candidateFullName(profile));
  const [apps, scan, reports] = await Promise.all([
    readApplications(slug),
    readScanHistory(),
    listReports(),
  ]);
  const first = candidateFirstName(profile);

  return (
    <div className="flex flex-col min-h-screen">
      <header className="flex items-center justify-between px-8 py-5 border-b">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
            <Sparkles className="size-4" />
          </div>
          <span className="font-semibold tracking-tight">Career-Ops</span>
          <Badge variant="outline" className="ml-2 text-[10px]">
            local-first · v1
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild>
            <Link href="/dashboard">
              Open Dashboard
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </header>

      <section className="flex flex-col items-center text-center px-8 py-20 sm:py-28 gap-6 border-b">
        <Badge variant="secondary" className="rounded-full px-3">
          AI-powered job search command center
        </Badge>
        <h1 className="max-w-4xl text-4xl sm:text-6xl font-semibold tracking-tight leading-tight">
          {first ? `Welcome back, ${first}.` : "Find better roles, faster."}
          <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-fuchsia-500">
            Then beat the resume tax.
          </span>
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Career-Ops scans portals, scores offers against your CV, generates
          tailored applications, and tracks every step — so you spend your
          time on the conversations that matter, not the spreadsheet.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
          <Button asChild size="lg">
            <Link href="/dashboard">
              Open Dashboard
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild size="lg">
            <Link href="/chat">Try the AI assistant</Link>
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-12 max-w-3xl w-full">
          <Card>
            <CardContent className="flex flex-col items-center py-6 px-4">
              <span className="text-3xl font-semibold tabular-nums">
                {apps.length}
              </span>
              <span className="text-xs text-muted-foreground mt-1">
                Tracked applications
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center py-6 px-4">
              <span className="text-3xl font-semibold tabular-nums">
                {scan.length}
              </span>
              <span className="text-xs text-muted-foreground mt-1">
                Jobs in scan history
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center py-6 px-4">
              <span className="text-3xl font-semibold tabular-nums">
                {reports.length}
              </span>
              <span className="text-xs text-muted-foreground mt-1">
                Evaluations on file
              </span>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="px-8 py-16">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-semibold tracking-tight mb-2">
            What you get
          </h2>
          <p className="text-muted-foreground mb-10 max-w-2xl">
            Six surfaces, one cohesive workflow. Every action — chat, evaluate,
            tailor, scan — writes back to the same canonical files
            (`applications.md`, `scan-history.tsv`, `reports/*.md`). Switch
            between the React UI and the Streamlit dashboard freely.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <Card key={title} className="hover:shadow-md transition-shadow">
                <CardContent className="px-6">
                  <div className="size-10 rounded-md bg-primary/10 text-primary flex items-center justify-center mb-4">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="font-semibold mb-2">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-8 py-16 border-t bg-muted/30">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-3">
            Ready to start?
          </h2>
          <p className="text-muted-foreground mb-6">
            Open the dashboard, paste a job URL into Pipeline, or just talk to
            the assistant. Everything lives on your machine — no cloud, no
            telemetry, your CV stays yours.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/dashboard">
                Open Dashboard
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/profile">Set up profile</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="px-8 py-6 border-t flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          Career-Ops · runs locally · powered by Cursor Agent + Next.js +
          Streamlit
        </span>
        <span>
          {apps.length} apps · {reports.length} reports · {scan.length} scanned
        </span>
      </footer>
    </div>
  );
}
