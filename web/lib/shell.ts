/**
 * Subprocess + Server-Sent Events helpers. Two main entry points:
 *
 *   1. `runJsonScript` — spawns a one-shot script that emits JSON on stdout
 *      (e.g. scrape-linkedin.mjs, add-to-scan.mjs), captures it, and parses.
 *   2. `streamProcess` — spawns a long-running script and streams its
 *      stdout/stderr line-by-line to the client over SSE. Used by the chat
 *      and evaluation routes where the user expects live phase updates.
 *
 * Both use `node` from PATH, so the host needs Node available. We resolve
 * paths against REPO_ROOT (the parent of `web/`) so the scripts can read
 * cv.md, modes/*, etc. relative to their working directory just like
 * Streamlit and the CLI.
 */

import { spawn } from "node:child_process";
import { REPO_ROOT } from "./paths";
import type { SseEvent } from "./types";

interface RunOpts {
  /** Args after the script path. */
  args?: string[];
  /** Optional stdin payload. */
  input?: string;
  /** Hard wall-clock timeout in ms (default 60s). */
  timeoutMs?: number;
  /** Override env vars. */
  env?: Record<string, string>;
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Spawns `node <scriptPath> <args...>` and resolves with the captured
 * output. Throws on timeout. Never throws on non-zero exit codes — the
 * caller decides whether that's an error (we surface it via exitCode).
 */
export function runScript(
  scriptPath: string,
  opts: RunOpts = {},
): Promise<RunResult> {
  const { args = [], input, timeoutMs = 60_000, env } = opts;
  return new Promise((resolve, reject) => {
    const child = spawn("node", [scriptPath, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
      reject(
        new Error(
          `Script timed out after ${timeoutMs}ms: ${scriptPath} ${args.join(" ")}`,
        ),
      );
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.on("error", (err) => {
      clearTimeout(timer);
      if (!killed) reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (killed) return;
      resolve({
        exitCode: code ?? -1,
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
      });
    });

    if (input !== undefined) {
      child.stdin.write(input);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
  });
}

/**
 * Convenience for scripts that emit JSON on stdout. Falls back to throwing
 * if the script either fails or produces unparseable output, so the API
 * route can return a clean 500 without trying to second-guess.
 */
export async function runJsonScript<T>(
  scriptPath: string,
  opts: RunOpts = {},
): Promise<T> {
  const result = await runScript(scriptPath, opts);
  if (result.exitCode !== 0) {
    const tail = (result.stderr || result.stdout).slice(-512).trim();
    throw new Error(
      `Script ${scriptPath} exited ${result.exitCode}: ${tail || "(no output)"}`,
    );
  }
  // Some scripts log status lines before the JSON — pick the last
  // non-empty line that parses as JSON.
  const lines = result.stdout.split(/\r?\n/).filter((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]) as T;
    } catch {
      continue;
    }
  }
  throw new Error(
    `Script ${scriptPath} did not emit parseable JSON. Output:\n${result.stdout}`,
  );
}

/**
 * Spawns a process and yields SSE-shaped events as its output streams in.
 * The returned ReadableStream is what a Next.js Route Handler returns to
 * deliver `text/event-stream` to the browser.
 *
 * Each line of stdout is emitted as a `stdout` event; stderr as `stderr`;
 * a final `done` event carries the exit code. The client reconstructs the
 * full output by concatenating in order. We deliberately keep the message
 * payload small (one line per event) so React state updates feel snappy.
 */
export function streamProcess(
  command: string,
  args: string[],
  opts: { input?: string; cwd?: string; env?: Record<string, string> } = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: SseEvent) => {
        const payload = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      let child;
      try {
        child = spawn(command, args, {
          cwd: opts.cwd ?? REPO_ROOT,
          env: { ...process.env, ...opts.env },
        });
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
        controller.close();
        return;
      }

      let stdoutBuf = "";
      let stderrBuf = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBuf += chunk.toString("utf-8");
        // Flush whole lines so the client sees individual log entries.
        const lines = stdoutBuf.split(/\r?\n/);
        stdoutBuf = lines.pop() ?? "";
        for (const line of lines) {
          send({ type: "stdout", data: line });
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderrBuf += chunk.toString("utf-8");
        const lines = stderrBuf.split(/\r?\n/);
        stderrBuf = lines.pop() ?? "";
        for (const line of lines) {
          send({ type: "stderr", data: line });
        }
      });
      child.on("error", (err: Error) => {
        send({ type: "error", message: err.message });
        controller.close();
      });
      child.on("close", (code: number | null) => {
        // Flush any unterminated tail.
        if (stdoutBuf) send({ type: "stdout", data: stdoutBuf });
        if (stderrBuf) send({ type: "stderr", data: stderrBuf });
        send({ type: "done", exitCode: code ?? -1 });
        controller.close();
      });

      if (opts.input !== undefined) {
        child.stdin.write(opts.input);
        child.stdin.end();
      } else {
        child.stdin.end();
      }
    },
  });
}

/** Standard SSE response headers. */
export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};
