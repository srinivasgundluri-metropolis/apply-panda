"use client";

import * as React from "react";
import { Loader2, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SseStream } from "@/components/sse-stream";

/**
 * "Scan portals" tab — runs `node scan.mjs` and streams stdout. Triggers
 * on button click rather than auto-start so the user can see what the
 * scan is about to do (and what data sources it queries).
 */
export function ScanRunner() {
  const [running, setRunning] = React.useState(false);
  const [bumpKey, setBumpKey] = React.useState(0);

  return (
    <div className="flex flex-col gap-4">
      <Card className="px-6 py-5 gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 max-w-xl">
            <p className="font-medium">Scan configured portals</p>
            <p className="text-sm text-muted-foreground mt-1">
              Hits Greenhouse / Ashby / Lever / Workday public APIs for every
              company in <code className="text-xs">portals.yml</code> with
              zero LLM cost. New offers are appended to{" "}
              <code className="text-xs">scan-history.tsv</code> with{" "}
              <Badge variant="outline" className="text-[10px] mx-1">
                added
              </Badge>{" "}
              status.
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
          label="Scanning portals"
          onDone={() => setRunning(false)}
          onError={() => setRunning(false)}
        />
      ) : null}
    </div>
  );
}
