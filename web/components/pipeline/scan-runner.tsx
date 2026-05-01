"use client";

import * as React from "react";
import Link from "next/link";
import { Info, Loader2, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SseStream } from "@/components/sse-stream";

/**
 * Pipeline tab — calls `/api/scan/run` (SSE) to fetch ATS boards and persist new rows to scan_history.
 */
export function ScanRunner() {
  const [running, setRunning] = React.useState(false);
  const [bumpKey, setBumpKey] = React.useState(0);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border bg-muted/30 px-4 py-3 flex gap-3 text-sm text-muted-foreground">
        <Info className="size-4 shrink-0 text-foreground/70 mt-0.5" aria-hidden />
        <p className="min-w-0 leading-relaxed">
          Boards must be saved under{" "}
          <Link
            href="/profile?tab=boards"
            className="text-foreground font-medium underline underline-offset-2 hover:text-primary"
          >
            Profile → ATS job boards
          </Link>
          . If a run fails with a configuration message, open that section, paste valid JSON, and save
          before trying again.
        </p>
      </div>
      <Card className="px-6 py-5 gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 max-w-xl">
            <p className="font-medium text-base">Scan job boards</p>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              Queries Greenhouse, Ashby, and Lever for every company in your saved board list, applies
              your title include/exclude rules, then writes new postings to{" "}
              <strong>Scan results</strong> with status{" "}
              <Badge variant="outline" className="text-[10px] mx-0.5 align-middle">
                added
              </Badge>
              . Existing URLs are skipped.
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
