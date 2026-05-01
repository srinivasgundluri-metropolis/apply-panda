"use client";

import * as React from "react";
import Link from "next/link";
import { DEFAULT_PORTAL_CATALOG_SIZE } from "@/lib/default-portal-catalog";
import { Info, Loader2, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SseStream } from "@/components/sse-stream";

/**
 * Pipeline tab — calls `/api/scan/run` (SSE) to fetch ATS boards and persist new rows to scan_history.
 * Backend is HTTP-only (`portal-scan.ts`); LLM is reserved for Chat, docs, evaluation, etc.
 */
export function ScanRunner() {
  const [running, setRunning] = React.useState(false);
  const [bumpKey, setBumpKey] = React.useState(0);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border bg-muted/30 px-4 py-3 flex gap-3 text-sm text-muted-foreground">
        <Info className="size-4 shrink-0 text-foreground/70 mt-0.5" aria-hidden />
        <p className="min-w-0 leading-relaxed">
          Set titles and locations under{" "}
          <Link
            href="/profile?tab=portals"
            className="text-foreground font-medium underline underline-offset-2 hover:text-primary"
          >
            Profile → Scan targeting
          </Link>
          . By default we hit every board in the hosted catalog ({DEFAULT_PORTAL_CATALOG_SIZE} employers); add an
          optional employer-name filter
          there if you only want specific companies. Each run ranks matches by recency when the ATS exposes dates
          and saves up to 100 newest URLs to Scan results (skipping ones you already stored).
        </p>
      </div>
      <Card className="px-6 py-5 gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 max-w-xl">
            <p className="font-medium text-base">Scan job boards</p>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              Runs <strong className="text-foreground font-medium">without any LLM</strong> — direct ATS HTTP APIs only
              (same idea as local <code className="rounded bg-muted px-1 py-px text-xs">scan.mjs</code>). Queries the built-in ATS board list with your saved title &amp; location rules, ranks matches by newest
              timestamps where available, then writes up to 100 postings to{" "}
              <strong>Scan results</strong>{" "}
              <Badge variant="outline" className="text-[10px] mx-0.5 align-middle">
                added
              </Badge>
              . URLs already on file are skipped.
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => {
              setBumpKey((k) => k + 1);
              setRunning(true);
            }}
            disabled={running}
          >
            {running ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            Run scan
          </Button>
        </div>
      </Card>

      {running ? (
        <SseStream
          key={bumpKey}
          url="/api/scan/run"
          label="Board scan"
          onDone={() => setRunning(false)}
          onError={() => setRunning(false)}
        />
      ) : null}
    </div>
  );
}
