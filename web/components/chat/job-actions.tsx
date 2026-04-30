"use client";

import * as React from "react";
import {
  BookmarkPlus,
  Loader2,
  Zap,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { isUsableJobUrl } from "@/lib/job-url";
import type {
  AddToScanResult,
  LinkedInResult,
} from "@/lib/types";

interface JobActionsProps {
  jobs: LinkedInResult[];
  /** Stable key prefix so multiple instances don't clash on rerender. */
  keyPrefix: string;
  /** Called when the user clicks ⚡ Evaluate on a single row. */
  onEvaluate: (job: LinkedInResult) => void;
}

export function JobActions({ jobs, keyPrefix, onEvaluate }: JobActionsProps) {
  const [savingAll, setSavingAll] = React.useState(false);
  const [savingIdx, setSavingIdx] = React.useState<number | null>(null);
  const [open, setOpen] = React.useState(false);

  if (jobs.length === 0) return null;

  const callAdd = async (
    payload: LinkedInResult[],
  ): Promise<AddToScanResult> => {
    const res = await fetch("/api/scan/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobs: payload }),
    });
    const json = (await res.json()) as AddToScanResult & { error?: string };
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    return json;
  };

  const onSaveAll = async () => {
    setSavingAll(true);
    try {
      const validJobs = jobs.filter((j) => isUsableJobUrl(j.url));
      if (validJobs.length === 0) {
        toast.error("No valid job URLs to save.");
        return;
      }
      const r = await callAdd(validJobs);
      toast.success(
        `Saved ${r.added} · skipped ${r.skipped_duplicates} duplicate${r.skipped_duplicates === 1 ? "" : "s"}.`,
      );
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    } finally {
      setSavingAll(false);
    }
  };

  const onSaveOne = async (i: number) => {
    setSavingIdx(i);
    try {
      if (!isUsableJobUrl(jobs[i].url)) {
        toast.error("This row has no valid job URL to save.");
        return;
      }
      const r = await callAdd([jobs[i]]);
      if (r.added > 0) {
        toast.success(`Saved: ${jobs[i].company} — ${jobs[i].title}`);
      } else {
        toast.message(`Already in scan history.`);
      }
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    } finally {
      setSavingIdx(null);
    }
  };

  return (
    <div className="mt-3 rounded-lg border bg-muted/40 px-3 py-2 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant="outline" className="text-[10px]">
            💼 {jobs.length} job{jobs.length === 1 ? "" : "s"}
          </Badge>
          <span className="text-xs text-muted-foreground truncate">
            Click 💾 to save · ⚡ to evaluate inline
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="default"
            onClick={onSaveAll}
            disabled={savingAll}
          >
            {savingAll ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <BookmarkPlus className="size-3.5" />
            )}
            Save all ({jobs.length})
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
            Per-job actions
          </Button>
        </div>
      </div>

      {open ? (
        <ul className="flex flex-col divide-y divide-border/60">
          {jobs.map((job, i) => (
            <li
              key={`${keyPrefix}-${i}`}
              className="flex items-center justify-between gap-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{job.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {job.company}
                  {job.location || job.posted
                    ? ` · ${[job.location, job.posted].filter(Boolean).join(" · ")}`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {isUsableJobUrl(job.url) ? (
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    title="Open job posting"
                  >
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  title="Save to scan list"
                  disabled={savingIdx === i || !isUsableJobUrl(job.url)}
                  onClick={() => onSaveOne(i)}
                >
                  {savingIdx === i ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <BookmarkPlus className="size-3.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Evaluate now"
                  disabled={!isUsableJobUrl(job.url)}
                  onClick={() => onEvaluate(job)}
                >
                  <Zap className="size-3.5 text-amber-500" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
