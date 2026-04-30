"use client";

import * as React from "react";
import { Loader2, Play, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SseStream } from "@/components/sse-stream";

/**
 * "Paste JD or URL" tab — pipeline page for pasted JD / URL workflows.
 *
 * Two paths:
 *   1. URL alone → server fetches the page, strips HTML, hands the agent
 *      the cleaned text along with the original URL for verification.
 *   2. Pasted JD text (with optional URL) → straight to the agent.
 *
 * The eval stream renders below; on completion, the user gets a toast and
 * the form resets. We intentionally do NOT auto-redirect — the user
 * should see the report path / score before navigating.
 */
export function PasteForm() {
  const [url, setUrl] = React.useState("");
  const [jdText, setJdText] = React.useState("");
  const [fetching, setFetching] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [streamArgs, setStreamArgs] = React.useState<{
    jdText: string;
    sourceUrl?: string;
  } | null>(null);

  const fetchFromUrl = async () => {
    if (!url.trim()) {
      toast.error("Paste a job URL first.");
      return;
    }
    setFetching(true);
    try {
      const res = await fetch("/api/jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setJdText(json.text as string);
      toast.success("JD fetched — review below before running.");
    } catch (e) {
      toast.error(`Fetch failed: ${(e as Error).message}`);
    } finally {
      setFetching(false);
    }
  };

  const runEval = () => {
    const text = jdText.trim();
    if (!text) {
      toast.error("Paste or fetch a JD first.");
      return;
    }
    setRunning(true);
    setStreamArgs({ jdText: text, sourceUrl: url.trim() || undefined });
  };

  const onDone = (_full: string, exitCode: number) => {
    setRunning(false);
    if (exitCode === 0) {
      toast.success("Evaluation complete — see report path in output.");
    } else {
      toast.error(`Evaluation finished with exit code ${exitCode}.`);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="px-6 py-5 gap-3">
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="jd-url">Job URL (optional)</Label>
            <div className="flex gap-2">
              <Input
                id="jd-url"
                placeholder="https://jobs.company.com/job/12345"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={running}
              />
              <Button
                onClick={fetchFromUrl}
                variant="outline"
                disabled={fetching || running || !url.trim()}
              >
                {fetching ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Wand2 className="size-4" />
                )}
                Fetch JD
              </Button>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="jd-text">Job description</Label>
            <Textarea
              id="jd-text"
              placeholder="Paste the JD here, or click Fetch JD above."
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              disabled={running}
              rows={10}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              The agent runs the full A–G evaluation, writes a report, and
              merges into the tracker. Both URL + JD are passed when
              available so it can verify with Playwright.
            </p>
            <Button
              onClick={runEval}
              disabled={running || !jdText.trim()}
              size="lg"
            >
              {running ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Run evaluation
            </Button>
          </div>
        </div>
      </Card>

      {streamArgs ? (
        <SseStream
          key={streamArgs.jdText.slice(0, 32)}
          url="/api/eval/stream"
          body={streamArgs}
          label="Evaluating job"
          onDone={onDone}
          onError={(m) => {
            setRunning(false);
            toast.error(`Eval error: ${m}`);
          }}
        />
      ) : null}
    </div>
  );
}
