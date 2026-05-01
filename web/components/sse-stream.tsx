"use client";

import * as React from "react";
import { detectPhase } from "@/lib/phase-detector";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import type { SseEvent } from "@/lib/types";

export interface SseHandle {
  /** Called once with the full output string + exit code when streaming ends. */
  onDone?: (full: string, exitCode: number) => void;
  /** Called on stream error. */
  onError?: (msg: string) => void;
}

export interface SseStreamProps extends SseHandle {
  /** API URL to POST to (or GET from). */
  url: string;
  /** Optional POST body. If omitted, the stream uses GET. */
  body?: unknown;
  /** Header label shown above the live output box. */
  label?: string;
  /** Auto-collapse the output box once the stream ends. */
  collapseOnDone?: boolean;
  className?: string;
}

interface InternalState {
  text: string;
  phase: string;
  status: "starting" | "running" | "done" | "error";
  exitCode: number | null;
  errorMessage: string | null;
  startedAt: number;
  elapsedMs: number;
}

// Initial state already marks the stream "running" so we can mount and
// kick off the fetch without a synchronous setState in an effect (which
// React 19 lints flag as a cascading render).
function initialState(): InternalState {
  return {
    text: "",
    phase: "Starting",
    status: "running",
    exitCode: null,
    errorMessage: null,
    startedAt: Date.now(),
    elapsedMs: 0,
  };
}

/**
 * Connects to a Next.js SSE route and renders live phase + tail output.
 *
 * Behavior:
 *   - On mount, opens a fetch stream to `url` (POST if `body` is provided,
 *     otherwise GET) and parses the `data: {...}` SSE frames.
 *   - Aggregates `stdout`/`stderr` events into a single text buffer.
 *   - Runs each line through `detectPhase` to update the phase badge.
 *   - On `done` event, calls `onDone(fullText, exitCode)`.
 *
 * The component does NOT auto-restart — to re-run, the parent should
 * unmount and remount it (use `key` to force a fresh stream).
 */
export function SseStream({
  url,
  body,
  label = "Live output",
  collapseOnDone = false,
  className,
  onDone,
  onError,
}: SseStreamProps) {
  const [state, setState] = React.useState<InternalState>(initialState);
  const fullTextRef = React.useRef<string>("");
  const tickRef = React.useRef<NodeJS.Timeout | null>(null);
  // Stable start timestamp captured once at mount so the elapsed counter
  // doesn't reset on accidental re-renders.
  const startRef = React.useRef<number>(state.startedAt);

  React.useEffect(() => {
    let cancelled = false;
    const start = startRef.current;

    const tick = setInterval(() => {
      if (cancelled) return;
      setState((s) =>
        s.status === "done" || s.status === "error"
          ? s
          : { ...s, elapsedMs: Date.now() - start },
      );
    }, 250);
    tickRef.current = tick;

    const init: RequestInit = {
      method: body !== undefined ? "POST" : "GET",
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    };

    (async () => {
      let response: Response;
      try {
        response = await fetch(url, init);
      } catch (e) {
        if (cancelled) return;
        const msg = (e as Error).message;
        setState((s) => ({ ...s, status: "error", errorMessage: msg }));
        onError?.(msg);
        return;
      }
      if (!response.ok || !response.body) {
        const msg = `HTTP ${response.status}`;
        setState((s) => ({ ...s, status: "error", errorMessage: msg }));
        onError?.(msg);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const consumeFrames = (): void => {
        const frames = buffer.split(/\n\n/);
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const dataLine = frame
            .split(/\n/)
            .find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          const payload = dataLine.slice("data:".length).trim();
          if (!payload) continue;
          let event: SseEvent;
          try {
            event = JSON.parse(payload);
          } catch {
            continue;
          }
          if (event.type === "stdout" || event.type === "stderr") {
            fullTextRef.current += event.data + "\n";
            setState((s) => {
              const phase = detectPhase(event.data, s.phase);
              const next = fullTextRef.current;
              return {
                ...s,
                text: next,
                phase,
                elapsedMs: Date.now() - s.startedAt,
              };
            });
          } else if (event.type === "phase") {
            setState((s) => ({ ...s, phase: event.data }));
          } else if (event.type === "done") {
            const code =
              typeof event.exitCode === "number" ? event.exitCode : 1;
            setState((s) => ({
              ...s,
              status: code === 0 ? "done" : "error",
              exitCode: code,
              elapsedMs: Date.now() - s.startedAt,
              errorMessage:
                code === 0 ? null : `Process exited with code ${code}`,
            }));
            onDone?.(fullTextRef.current, code);
          } else if (event.type === "error") {
            setState((s) => ({
              ...s,
              status: "error",
              errorMessage: event.message,
              elapsedMs: Date.now() - s.startedAt,
            }));
            onError?.(event.message);
          }
        }
      };

      while (!cancelled) {
        const { value, done } = await reader.read();
        if (value?.length) {
          buffer += decoder.decode(value, { stream: true });
          consumeFrames();
        }
        if (done) {
          // Flush any pending multi-byte Unicode so the trailing `done` SSE
          // frame can parse correctly.
          buffer += decoder.decode();
          consumeFrames();
          break;
        }
      }

      // Rare: last frame lacked a terminating blank line — try one more pass.
      if (buffer.trim().length && !cancelled) {
        buffer += "\n\n";
        consumeFrames();
      }
    })();

    return () => {
      cancelled = true;
      if (tickRef.current) clearInterval(tickRef.current);
    };
    // We deliberately want a single stream per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const elapsedSec = Math.floor(state.elapsedMs / 1000);
  const isRunning = state.status === "running" || state.status === "starting";
  const collapsed = collapseOnDone && state.status === "done";

  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b bg-muted/40">
        <div className="flex items-center gap-2 min-w-0">
          {isRunning ? (
            <Loader2 className="size-4 animate-spin text-primary shrink-0" />
          ) : state.status === "done" ? (
            <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
          ) : (
            <AlertCircle className="size-4 text-destructive shrink-0" />
          )}
          <span className="text-sm font-medium truncate">{label}</span>
          <Badge variant="outline" className="text-[10px] shrink-0">
            {state.phase}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums shrink-0">
          {elapsedSec}s
          {state.exitCode !== null ? ` · exit ${state.exitCode}` : ""}
        </div>
      </div>
      {!collapsed ? (
        <pre className="text-xs p-3 max-h-72 overflow-auto whitespace-pre-wrap font-mono leading-relaxed">
          {state.text || (isRunning ? "starting…" : "(no output)")}
        </pre>
      ) : null}
      {state.errorMessage ? (
        <div className="px-4 py-2 text-xs text-destructive border-t">
          {state.errorMessage}
        </div>
      ) : null}
    </div>
  );
}
