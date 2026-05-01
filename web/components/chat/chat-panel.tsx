"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, Bot, UserRound, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/chat/markdown";
import { JobActions } from "@/components/chat/job-actions";
import { RecentSearches } from "@/components/chat/recent-searches";
import { SseStream } from "@/components/sse-stream";
import { extractJobsBlock } from "@/lib/jobs-block";
import { cn } from "@/lib/utils";
import type {
  LinkedInResponse,
  LinkedInResult,
  RecentSearch,
  SseEvent,
} from "@/lib/types";

interface ChatPanelProps {
  candidateFirst: string;
  /** Passed from profile—optional LinkedIn location parameter for guest search. */
  profileLocationHint?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Jobs extracted from the assistant message (only set after stream ends). */
  jobs?: LinkedInResult[];
  /** Reply from `/api/resume-context/apply` (saved canon files updated). */
  resumeCoachReply?: boolean;
  /** Stable id to keep React keys stable across streaming updates. */
  id: string;
}

const RECENT_KEY = "career-ops:recent-searches";
const HISTORY_KEY = "career-ops:chat-history";

const SUGGESTED_PROMPTS = [
  "LinkedIn search: senior machine learning engineer remote",
  "Find staff backend roles in London on LinkedIn",
  "Given my profile, suggest a sharper LinkedIn About section (3 short paragraphs)",
  "Which roles in my tracker are still Evaluated vs Applied — what should I do next?",
  "Compare my profile target_roles to these LinkedIn postings I care about…",
];

/** Short label on chip; full text sent to `/api/resume-context/apply`. */
const COACH_PROMPTS: { label: string; instruction: string }[] = [
  {
    label: "Rewrite Summary + Skills (ML)",
    instruction:
      "Rewrite my Summary in cv.md to emphasize product ML and add a bullets line under Skills for Python + Torch.",
  },
  {
    label: "Set targeting narrative",
    instruction:
      "Set profile.yml narrative: targeting staff+ ML roles, remote US, avoiding defense contractors.",
  },
  {
    label: "Cover-letter voice",
    instruction:
      "My cover-letter base: formal, three short paragraphs, always close with willingness to relocate.",
  },
  {
    label: "Sync profile from résumé",
    instruction:
      "Using only what is clearly supported by my current canonical résumé markdown, propose profile_updates: refresh target_roles, narrative.one_liner, narrative.proof_points, and candidate fields where they match the CV. Do not invent achievements or metrics. Return cv_md as null unless you fix obvious typos. Return cover_letter_base_md as null unless this message explicitly asks to change cover-letter preferences.",
  },
];

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadRecent(): RecentSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as RecentSearch[]) : [];
  } catch {
    return [];
  }
}

function saveRecent(searches: RecentSearch[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(searches));
  } catch {
    // Quota / private mode: silently ignore.
  }
}

function escapeTableCell(s: string): string {
  return s.replace(/\|/g, "·").replace(/\n/g, " ").trim();
}

function formatInlineCode(s: string): string {
  const t = s.trim() || "—";
  return `\`${t.replace(/`/g, "'")}\``;
}

function buildLinkedInSearchReply(data: LinkedInResponse): {
  content: string;
  jobs: LinkedInResult[];
} {
  const q = data.query;
  const remoteNote = q.remote ? "**Remote-only filter:** on.\n\n" : "";
  const lines: string[] = [
    "**LinkedIn Jobs** (guest search API — postings open in `linkedin.com/jobs/view/…`; use only for your own job search and respect LinkedIn’s terms).",
    "",
    remoteNote + "**Query sent:**",
    `- Keywords: ${formatInlineCode(q.keywords)}`,
    `- Location parameter: ${formatInlineCode(q.location)}`,
    `- Time filter: \`${q.time_range}\` · Limit: ${q.limit}`,
    "",
    `**Fetched:** ${data.results.length} row(s). (_LinkedIn often paginates guest results—these are the first postings we could retrieve.)_`,
  ];
  const jobs = data.results;
  if (jobs.length === 0) {
    return {
      content:
        lines.join("\n") +
        "\n\n_No postings returned. Broaden keywords, try another location phrase, toggle **LinkedIn search first** off and ask for strategy—or run an ATS scan from **Pipeline → Run scan**._",
      jobs: [],
    };
  }
  const header = "| Company | Title | Location | URL |\n| --- | --- | --- | --- |";
  const rows = jobs.map(
    (j) =>
      `| ${escapeTableCell(j.company)} | ${escapeTableCell(j.title)} | ${escapeTableCell(j.location)} | ${j.url} |`,
  );
  return { content: `${lines.join("\n")}\n\n${header}\n${rows.join("\n")}`, jobs };
}

function loadHistory(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: ChatMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-30)));
  } catch {
    // Ignore.
  }
}

async function readErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  if (!text) return `HTTP ${res.status}`;
  try {
    const parsed = JSON.parse(text) as { error?: string; message?: string };
    return parsed.error || parsed.message || `HTTP ${res.status}`;
  } catch {
    const sseMatch = text.match(/data:\s*(\{.*\})/);
    if (sseMatch?.[1]) {
      try {
        const parsed = JSON.parse(sseMatch[1]) as { message?: string };
        if (parsed.message) return parsed.message;
      } catch {
        // ignore parse failure
      }
    }
    return text.slice(0, 300);
  }
}

export function ChatPanel({
  candidateFirst,
  profileLocationHint,
}: ChatPanelProps) {
  const [history, setHistory] = React.useState<ChatMessage[]>([]);
  const [recent, setRecent] = React.useState<RecentSearch[]>([]);
  const [input, setInput] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [streamingContent, setStreamingContent] = React.useState("");
  const [resumeCoachMode, setResumeCoachMode] = React.useState(false);
  const [resumeCoachLoading, setResumeCoachLoading] = React.useState(false);
  const [coachProgressHint, setCoachProgressHint] = React.useState("");
  const [coachResumeFile, setCoachResumeFile] = React.useState<File | null>(null);
  const [uploadedResumeMarkdown, setUploadedResumeMarkdown] = React.useState("");
  const coachPdfInputRef = React.useRef<HTMLInputElement>(null);
  const [pendingEval, setPendingEval] = React.useState<LinkedInResult | null>(
    null,
  );
  const [evalKey, setEvalKey] = React.useState(0);
  const [linkedInSearchFirst, setLinkedInSearchFirst] = React.useState(true);
  const [linkedInSearching, setLinkedInSearching] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  // Without this guard, the first persist effect ran while `history` was still
  // empty (before hydrate completed), overwriting localStorage — wiping chat.
  const skipPersistHistoryOnce = React.useRef(true);
  const skipPersistRecentOnce = React.useRef(true);

  // Hydrate from localStorage on mount.
  React.useEffect(() => {
    setHistory(loadHistory());
    setRecent(loadRecent());
  }, []);

  // Persist whenever they change (skip the very first save so hydration does
  // not clobber restored messages with []).
  React.useEffect(() => {
    if (skipPersistHistoryOnce.current) {
      skipPersistHistoryOnce.current = false;
      return;
    }
    saveHistory(history);
  }, [history]);
  React.useEffect(() => {
    if (skipPersistRecentOnce.current) {
      skipPersistRecentOnce.current = false;
      return;
    }
    saveRecent(recent);
  }, [recent]);

  // Auto-scroll to bottom on new content.
  React.useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history, streamingContent, resumeCoachLoading]);

  React.useEffect(() => {
    if (!resumeCoachMode) {
      setCoachResumeFile(null);
      setUploadedResumeMarkdown("");
      if (coachPdfInputRef.current) coachPdfInputRef.current.value = "";
    }
  }, [resumeCoachMode]);

  const trackRecent = (prompt: string, jobs: LinkedInResult[]) => {
    if (jobs.length === 0) return;
    setRecent((prev) => {
      const filtered = prev.filter(
        (s) => s.prompt.toLowerCase() !== prompt.toLowerCase(),
      );
      const next: RecentSearch[] = [
        {
          prompt,
          jobs,
          timestamp: new Date().toISOString(),
          count: jobs.length,
        },
        ...filtered,
      ].slice(0, 4);
      return next;
    });
  };

  const sendResumeCoach = async (instructionOverride?: string) => {
    const textNote =
      instructionOverride !== undefined
        ? instructionOverride.trim()
        : input.trim();
    const resumeFile = coachResumeFile;

    if (!uploadedResumeMarkdown && !textNote) return;
    if (resumeCoachLoading || streaming || linkedInSearching) return;

    const uploadingPdf = uploadedResumeMarkdown.length > 0;
    const resumeName = resumeFile?.name ?? "uploaded-resume";
    const userContent = uploadingPdf
      ? `_Uploaded resume file_: **${resumeName}**${
          textNote ? `\n\n${textNote}` : ""
        }`
      : textNote;

    const userMsg: ChatMessage = {
      role: "user",
      content: userContent,
      id: makeId(),
    };
    const assistantId = makeId();
    setHistory((prev) => [...prev, userMsg]);
    setResumeCoachLoading(true);
    setCoachProgressHint(
      uploadingPdf
        ? "Applying uploaded resume markdown to canon files…"
        : "Updating cv.md, profile.yml, cover-letter base…",
    );

    try {
      const res = await fetch("/api/resume-context/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: textNote || undefined,
          uploadedResumeMarkdown: uploadedResumeMarkdown || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.message ?? "(no reply)",
          id: assistantId,
          resumeCoachReply: true,
        },
      ]);
      toast.success(
        uploadingPdf
          ? "Imported uploaded resume into cv.md / profile.yml (and cover-letter base when the model suggests it)."
          : "cv.md / profile.yml / cover-letter base synced from chat.",
      );
      setInput("");
      setCoachResumeFile(null);
      setUploadedResumeMarkdown("");
      if (coachPdfInputRef.current) coachPdfInputRef.current.value = "";
    } catch (e) {
      toast.error(`Coach failed: ${(e as Error).message}`);
      setHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `_Update failed: ${(e as Error).message}_`,
          id: assistantId,
        },
      ]);
    } finally {
      setResumeCoachLoading(false);
      setCoachProgressHint("");
    }
  };

  const uploadResumeFile = async (file: File) => {
    if (resumeCoachLoading || streaming || linkedInSearching) return;
    setResumeCoachLoading(true);
    setCoachProgressHint("Converting resume file to markdown…");
    try {
      const fd = new FormData();
      fd.append("resume", file);
      const res = await fetch("/api/resume-context/upload", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as { markdown?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const md = (data.markdown ?? "").trim();
      if (!md) throw new Error("Upload succeeded but markdown was empty.");
      setUploadedResumeMarkdown(md);
      toast.success("Resume file converted to markdown. Add notes and click send to apply.");
    } catch (e) {
      toast.error(`Resume import failed: ${(e as Error).message}`);
      setCoachResumeFile(null);
      setUploadedResumeMarkdown("");
      if (coachPdfInputRef.current) coachPdfInputRef.current.value = "";
    } finally {
      setResumeCoachLoading(false);
      setCoachProgressHint("");
    }
  };

  const runLinkedInJobSearch = async (message: string) => {
    const userMsg: ChatMessage = {
      role: "user",
      content: message,
      id: makeId(),
    };
    const assistantId = makeId();
    setHistory((prev) => [...prev, userMsg]);
    setInput("");
    setLinkedInSearching(true);
    try {
      const res = await fetch("/api/linkedin/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: message,
          limit: 25,
          ...(profileLocationHint
            ? { location: profileLocationHint }
            : {}),
          timeRange: "any",
        }),
      });
      const data = (await res.json()) as LinkedInResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const { content, jobs } = buildLinkedInSearchReply(data);
      setHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content,
          jobs: jobs.length > 0 ? jobs : undefined,
          id: assistantId,
        },
      ]);
      if (jobs.length > 0) trackRecent(message, jobs);
    } catch (e) {
      toast.error(`LinkedIn search failed: ${(e as Error).message}`);
      setHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `_LinkedIn search failed: ${(e as Error).message}_`,
          id: assistantId,
        },
      ]);
    } finally {
      setLinkedInSearching(false);
    }
  };

  const sendMessage = async (rawText: string) => {
    const message = rawText.trim();
    if (!message || streaming || resumeCoachLoading || linkedInSearching) return;

    if (!resumeCoachMode && linkedInSearchFirst) {
      await runLinkedInJobSearch(message);
      return;
    }

    const userMsg: ChatMessage = {
      role: "user",
      content: message,
      id: makeId(),
    };
    const assistantId = makeId();
    setHistory((prev) => [...prev, userMsg]);
    setStreaming(true);
    setStreamingContent("");
    setInput("");

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: [...history, userMsg].slice(-12).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });
      if (!res.ok || !res.body) {
        throw new Error(await readErrorMessage(res));
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\n\n/);
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const dataLine = frame.split(/\n/).find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          const payload = dataLine.slice("data:".length).trim();
          if (!payload) continue;
          let event: SseEvent;
          try {
            event = JSON.parse(payload);
          } catch {
            continue;
          }
          if (event.type === "stdout") {
            assistantText += event.data + "\n";
            setStreamingContent(assistantText);
          } else if (event.type === "stderr") {
            // Errors from cursor-agent — surface but don't break the bubble.
            assistantText += `\n_${event.data}_\n`;
            setStreamingContent(assistantText);
          } else if (event.type === "error") {
            throw new Error(event.message);
          } else if (event.type === "done") {
            const { cleaned, jobs } = extractJobsBlock(assistantText);
            const finalMsg: ChatMessage = {
              role: "assistant",
              content: cleaned.trim() || "(no response)",
              jobs: jobs ?? undefined,
              id: assistantId,
            };
            setHistory((prev) => [...prev, finalMsg]);
            setStreamingContent("");
            if (jobs && jobs.length > 0) {
              trackRecent(message, jobs);
            }
          }
        }
      }
    } catch (e) {
      toast.error(`Chat failed: ${(e as Error).message}`);
      setHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `_Chat failed: ${(e as Error).message}_`,
          id: assistantId,
        },
      ]);
      setStreamingContent("");
    } finally {
      setStreaming(false);
    }
  };

  const handleEvaluate = (job: LinkedInResult) => {
    setPendingEval(job);
    setEvalKey((k) => k + 1);
  };

  const handleShowRecent = (search: RecentSearch) => {
    setHistory((prev) => [
      ...prev,
      {
        role: "user",
        content: `Show: ${search.prompt}`,
        id: makeId(),
      },
      {
        role: "assistant",
        content: `Cached results from ${new Date(search.timestamp).toLocaleString()}:`,
        jobs: search.jobs,
        id: makeId(),
      },
    ]);
  };

  const handleReplayRecent = (search: RecentSearch) => {
    sendMessage(search.prompt);
  };

  const clearAll = () => {
    skipPersistHistoryOnce.current = false;
    skipPersistRecentOnce.current = false;
    setHistory([]);
    setRecent([]);
    setStreamingContent("");
    saveHistory([]);
    saveRecent([]);
  };

  const busy = streaming || resumeCoachLoading || linkedInSearching;
  const empty = history.length === 0 && !busy;

  const recentUserPrompts = React.useMemo(() => {
    const users = history.filter((m) => m.role === "user");
    return users.slice(-4).reverse();
  }, [history]);

  return (
    <div className="flex flex-col gap-4 h-full">
      {recentUserPrompts.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
            Your last {recentUserPrompts.length} question
            {recentUserPrompts.length === 1 ? "" : "s"}
          </h3>
          <div className="flex flex-wrap gap-2">
            {recentUserPrompts.map((m) => (
              <Button
                key={m.id}
                type="button"
                variant="outline"
                size="sm"
                className="max-w-[min(280px,calc(100vw-12rem))] truncate text-xs h-8"
                title={m.content}
                disabled={busy}
                onClick={() => {
                  if (resumeCoachMode) void sendResumeCoach(m.content);
                  else void sendMessage(m.content);
                }}
              >
                {m.content.length > 52
                  ? `${m.content.slice(0, 50)}…`
                  : m.content}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {recent.length > 0 ? (
        <RecentSearches
          searches={recent}
          onShow={handleShowRecent}
          onReplay={handleReplayRecent}
          onClear={() => setRecent([])}
        />
      ) : null}

      {!resumeCoachMode ? null : (
        <p className="text-[11px] text-muted-foreground px-1">
          Coach updates <code className="text-[10px]">cv.md</code>,{" "}
          <code className="text-[10px]">config/profile.yml</code>, and{" "}
          <code className="text-[10px]">config/cover-letter-base.md</code>. Then
          use Tracker → <strong>Tailored documents</strong> →{" "}
          <strong>Regenerate…</strong> per job (skipped when status is{" "}
          <strong>Applied</strong>).
        </p>
      )}

      <Card className="flex-1 min-h-0 px-0 py-0 gap-0 overflow-hidden">
        <div
          ref={scrollRef}
          className="flex-1 min-h-[420px] max-h-[calc(100vh-360px)] overflow-y-auto px-6 py-4 flex flex-col gap-5"
        >
          {empty ? (
            <div className="flex flex-col items-center justify-center text-center my-auto py-10 gap-3">
              <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Sparkles className="size-6" />
              </div>
              <div>
                <p className="font-semibold">
                  Hi{candidateFirst ? `, ${candidateFirst}` : ""} — what would
                  you like to work on?
                </p>
                <p className="text-sm text-muted-foreground max-w-md mt-1">
                  {resumeCoachMode
                    ? "Describe changes, upload a résumé file (`.docx/.md/.txt`) for conversion, or both — the coach merges into your workspace using your configured model."
                    : "With **LinkedIn search first** on, Send runs the guest Jobs API against your keywords (optional location from Profile). Results are real URLs you can ⚡ Evaluate. Turn it off to chat about tracker, reports, negotiation, headline/About drafts, or how your profile/targeting fits openings—still grounded in **your saved data**."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-2xl mt-2">
                {resumeCoachMode
                  ? COACH_PROMPTS.map((item) => (
                      <Button
                        key={item.label}
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void sendResumeCoach(item.instruction)}
                        className="text-xs max-w-[220px] text-left whitespace-normal h-auto py-2 leading-snug"
                        title={item.instruction}
                      >
                        {item.label}
                      </Button>
                    ))
                  : SUGGESTED_PROMPTS.map((p) => (
                      <Button
                        key={p}
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void sendMessage(p)}
                        className="text-xs"
                      >
                        {p}
                      </Button>
                    ))}
              </div>
            </div>
          ) : (
            history.map((m) => (
              <Bubble key={m.id} message={m} onEvaluate={handleEvaluate} />
            ))
          )}
          {resumeCoachLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>
                {coachProgressHint ||
                  "Updating cv.md, profile.yml, cover-letter base…"}
              </span>
            </div>
          ) : null}
          {streaming && streamingContent ? (
            <Bubble
              message={{
                role: "assistant",
                content: streamingContent,
                id: "live-streaming",
              }}
              onEvaluate={handleEvaluate}
              live
            />
          ) : streaming || linkedInSearching ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>
                {linkedInSearching ? "Searching LinkedIn…" : "thinking…"}
              </span>
            </div>
          ) : null}
        </div>

        <div className="border-t bg-muted/40 px-4 py-3 flex flex-col gap-2">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-1 size-4 rounded border-input shrink-0"
              checked={resumeCoachMode}
              onChange={(e) => setResumeCoachMode(e.target.checked)}
              disabled={busy}
            />
            <span className="text-xs text-muted-foreground leading-snug">
              <span className="font-medium text-foreground">
                Résumé / profile coach
              </span>{" "}
              — update <code className="text-[10px]">cv.md</code>,{" "}
              <code className="text-[10px]">profile.yml</code>,{" "}
              <code className="text-[10px]">cover-letter-base.md</code>{" "}
              (requires <code className="text-[10px]">OPENAI_API_KEY</code> in environment). Turn this on <em>instead of</em> LinkedIn / strategy chat.
            </span>
          </label>
          {!resumeCoachMode ? (
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-1 size-4 rounded border-input shrink-0"
                checked={linkedInSearchFirst}
                onChange={(e) => setLinkedInSearchFirst(e.target.checked)}
                disabled={busy}
              />
              <span className="text-xs text-muted-foreground leading-snug">
                <span className="font-medium text-foreground">
                  LinkedIn search first
                </span>{" "}
                — guest Jobs API using your box text as keywords
                {profileLocationHint ? (
                  <>
                    {" "}
                    and your Profile location (
                    <span className="font-mono text-[10px]">
                      {profileLocationHint.length > 40
                        ? `${profileLocationHint.slice(0, 38)}…`
                        : profileLocationHint}
                    </span>
                    )
                  </>
                ) : null}
                . Off = chat only (summaries of tracker/reports, LinkedIn headline ideas, negotiating, etc.).
              </span>
            </label>
          ) : null}
          {resumeCoachMode ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-0.5">
              <input
                ref={coachPdfInputRef}
                type="file"
                accept=".docx,.md,.txt,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="sr-only"
                aria-label="Upload resume file"
                disabled={busy}
                onChange={(e) =>
                  {
                    const file = e.target.files?.[0] ?? null;
                    setCoachResumeFile(file);
                    if (file) void uploadResumeFile(file);
                  }
                }
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs shrink-0"
                disabled={busy}
                onClick={() => coachPdfInputRef.current?.click()}
              >
                <Upload className="size-3.5 mr-1.5" />
                Resume File
              </Button>
              {coachResumeFile ? (
                <>
                  <span
                    className="text-xs text-muted-foreground truncate max-w-[min(200px,calc(100vw-14rem))]"
                    title={coachResumeFile.name}
                  >
                    {coachResumeFile.name}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs shrink-0"
                    disabled={busy}
                    onClick={() => {
                      setCoachResumeFile(null);
                      setUploadedResumeMarkdown("");
                      if (coachPdfInputRef.current) {
                        coachPdfInputRef.current.value = "";
                      }
                    }}
                  >
                    Clear File
                  </Button>
                </>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  Upload `.docx`, `.md`, or `.txt` first, then click send.
                </span>
              )}
            </div>
          ) : null}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (resumeCoachMode) void sendResumeCoach();
              else void sendMessage(input);
            }}
            className="flex items-end gap-2"
          >
            <Textarea
              placeholder={
                resumeCoachMode
                  ? "e.g. Instructions to merge into your uploaded resume import, or type-only edits (Skills, headline…)"
                  : linkedInSearchFirst
                    ? "LinkedIn keywords e.g. staff ML platform engineer remote — or add a city/country…"
                    : "Ask about your tracker/reports, profile fit, LinkedIn About/headline, negotiation…"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (resumeCoachMode) void sendResumeCoach();
                  else void sendMessage(input);
                }
              }}
              disabled={busy}
              rows={2}
              className="resize-none flex-1 min-h-[44px] bg-background"
            />
            <Button
              type="submit"
              disabled={
                busy ||
                (resumeCoachMode
                  ? !uploadedResumeMarkdown && !input.trim()
                  : !input.trim())
              }
              size="lg"
              className="self-stretch"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </form>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              ⏎ to send · ⇧⏎ for newline · transcript saved in this browser
              (last ~30 messages)
            </span>
            {history.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                className="h-7 text-xs text-muted-foreground"
              >
                Clear conversation
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {pendingEval ? (
        <Card className="px-6 py-5 gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
                Inline evaluation
              </p>
              <p className="font-semibold truncate">
                {pendingEval.company} — {pendingEval.title}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {pendingEval.url}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPendingEval(null)}
            >
              Cancel
            </Button>
          </div>
          <InlineEval key={evalKey} job={pendingEval} />
        </Card>
      ) : null}
    </div>
  );
}

interface BubbleProps {
  message: ChatMessage;
  onEvaluate: (job: LinkedInResult) => void;
  live?: boolean;
}

function Bubble({ message, onEvaluate, live }: BubbleProps) {
  const isUser = message.role === "user";

  // Strip the jobs-json block out of any assistant content — we already
  // captured it as `message.jobs` and rendered it via JobActions; we
  // don't want it duplicated as raw JSON in the bubble.
  const { cleaned, jobs: parsedFromContent } = isUser
    ? { cleaned: message.content, jobs: null }
    : extractJobsBlock(message.content);
  const jobs = message.jobs ?? parsedFromContent ?? null;

  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? (
        <div className="size-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-1">
          <Bot className="size-3.5" />
        </div>
      ) : null}
      <div
        className={cn(
          "max-w-[85%] flex flex-col gap-1.5",
          isUser ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm",
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted rounded-tl-sm",
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap leading-relaxed">{cleaned}</p>
          ) : (
            <Markdown content={cleaned || (live ? "…" : "(empty)")} />
          )}
        </div>
        {!isUser && jobs && jobs.length > 0 ? (
          <div className="w-full">
            <JobActions
              jobs={jobs}
              keyPrefix={message.id}
              onEvaluate={onEvaluate}
            />
          </div>
        ) : null}
        {!isUser && message.resumeCoachReply ? (
          <Badge variant="secondary" className="text-[10px] w-fit">
            Canon files updated
          </Badge>
        ) : null}
        {live ? (
          <Badge variant="outline" className="text-[10px]">
            streaming…
          </Badge>
        ) : null}
      </div>
      {isUser ? (
        <div className="size-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 mt-1">
          <UserRound className="size-3.5" />
        </div>
      ) : null}
    </div>
  );
}

function InlineEval({ job }: { job: LinkedInResult }) {
  const router = useRouter();
  const [jdReady, setJdReady] = React.useState(false);
  const [jdText, setJdText] = React.useState<string | null>(null);
  const [jdError, setJdError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/jd", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: job.url }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setJdError(json.error ?? `HTTP ${res.status}`);
        } else {
          setJdText(json.text as string);
        }
      } catch (e) {
        if (cancelled) return;
        setJdError((e as Error).message);
      } finally {
        if (!cancelled) setJdReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job.url]);

  if (!jdReady) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Fetching job description…
      </div>
    );
  }
  if (jdError || !jdText) {
    return (
      <p className="text-sm text-destructive">
        Couldn&apos;t fetch JD: {jdError ?? "empty body"}. Try evaluating from
        the Pipeline tab and pasting the JD manually.
      </p>
    );
  }
  return (
    <SseStream
      url="/api/eval/stream"
      body={{ jdText, sourceUrl: job.url }}
      label={`Evaluating ${job.company}`}
      onDone={(_txt, exit) => {
        if (exit === 0) router.refresh();
      }}
    />
  );
}
