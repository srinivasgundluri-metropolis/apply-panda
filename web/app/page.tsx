import Link from "next/link";
import { ArrowRight, Bot, BarChart3, FileText, Search, Target, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { LogoMark } from "@/components/branding/logo-mark";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    title: "Repo-native workflow",
    description:
      "All state lives in markdown and YAML under your repo. This app invokes the same `.mjs` scripts, modes, and templates as the rest of the stack — one source of truth on disk.",
  },
];

export default async function LandingPage() {
  const hasSession = await (async () => {
    try {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return Boolean(user);
    } catch {
      return false;
    }
  })();

  return (
    <div className="flex flex-col min-h-screen">
      <header className="flex items-center justify-between px-8 py-5 border-b">
        <div className="flex items-center gap-2">
          <LogoMark />
          <span className="font-semibold tracking-tight">ApplyPanda</span>
          <Badge variant="outline" className="ml-2 text-[10px]">
            free for everyone · beta
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild>
            <Link href={hasSession ? "/dashboard" : "/auth"}>
              {hasSession ? "Open Dashboard" : "Get Started Free"}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </header>

      <section className="flex flex-col items-center text-center px-8 py-20 sm:py-28 gap-6 border-b">
        <Badge variant="secondary" className="rounded-full px-3">
          AI-powered job search command center · free for everyone
        </Badge>
        <h1 className="max-w-4xl text-4xl sm:text-6xl font-semibold tracking-tight leading-tight">
          Find better roles, faster.
          <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-fuchsia-500">
            Then beat the resume tax.
          </span>
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          ApplyPanda helps you scan portals, score offers against your CV,
          generate tailored applications, and track every step — so you spend
          your time on the conversations that matter, not the spreadsheet. No
          subscription required.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
          <Button asChild size="lg">
            <Link href={hasSession ? "/dashboard" : "/auth"}>
              {hasSession ? "Open Dashboard" : "Create Free Account"}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild size="lg">
            <Link href={hasSession ? "/chat" : "/auth"}>
              {hasSession ? "Try the AI assistant" : "Sign in"}
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-12 max-w-3xl w-full">
          <Card>
            <CardContent className="flex flex-col items-center py-6 px-4">
              <span className="text-3xl font-semibold tabular-nums">Auth</span>
              <span className="text-xs text-muted-foreground mt-1">
                Secure account workspace
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center py-6 px-4">
              <span className="text-3xl font-semibold tabular-nums">AI</span>
              <span className="text-xs text-muted-foreground mt-1">
                AI-powered workflows
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center py-6 px-4">
              <span className="text-3xl font-semibold tabular-nums">RLS</span>
              <span className="text-xs text-muted-foreground mt-1">
                Per-user isolated data
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
            (`applications.md`, `scan-history.tsv`, `reports/*.md`) on disk.
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
            the assistant. ApplyPanda is free for everyone and runs as a hosted
            web app with private user workspaces.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href={hasSession ? "/dashboard" : "/auth"}>
                {hasSession ? "Open Dashboard" : "Start Free"}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={hasSession ? "/profile" : "/auth"}>
                {hasSession ? "Set up profile" : "Sign in"}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="px-8 py-6 border-t flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          ApplyPanda · free for everyone · powered by AI + Next.js
        </span>
        <span className="flex items-center gap-2">
          <Link href="/terms" className="underline">
            Terms
          </Link>
          <span>·</span>
          <Link href="/privacy" className="underline">
            Privacy
          </Link>
          <span>·</span>
          <Link href="/attribution" className="underline">
            Attribution
          </Link>
          <span>·</span>
          <span>Hosted on Vercel · Auth + Supabase</span>
        </span>
      </footer>
    </div>
  );
}
