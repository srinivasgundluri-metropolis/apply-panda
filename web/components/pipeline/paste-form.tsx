"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
 * The eval stream renders below; on completion the client refreshes RSC data
 * and shows a toast. The streamed output includes tracker/report confirmation.
 */
export function PasteForm() {
  const router = useRouter();
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
      router.refresh();
      toast.success("Evaluation saved to tracker — check Dashboard.");
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
              Runs an AI fit evaluation from your JD text, saves a report plus
              a tracker row linked to your account. Pass a URL too so the scan
              list can flip to Evaluated when the posting came from Scanner.
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
