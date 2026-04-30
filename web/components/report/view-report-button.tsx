"use client";

import * as React from "react";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Markdown } from "@/components/chat/markdown";
import { cn } from "@/lib/utils";

interface ViewReportButtonProps {
  /** Application / tracker report number (matches `reports/NNN-*.md`). */
  reportNum: string;
  /** Dialog title override (defaults to API company + role). */
  label?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  /** Icon + short label suitable for toolbar rows. */
  compact?: boolean;
}

export function ViewReportButton({
  reportNum,
  label,
  variant = "outline",
  size = "sm",
  className,
  compact,
}: ViewReportButtonProps) {
  const num = reportNum.trim();

  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [markdown, setMarkdown] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState<string>("");

  const loadReport = React.useCallback(async () => {
    if (!num) return;
    setLoading(true);
    setError(null);
    setMarkdown(null);
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(num)}`);
      const j = (await res.json()) as {
        error?: string;
        report?: {
          content?: string;
          company?: string | null;
          role?: string | null;
        };
      };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      const rep = j.report;
      setMarkdown(rep?.content ?? "");
      if (label) setTitle(label);
      else if (rep?.company && rep?.role) {
        setTitle(`${rep.company} — ${rep.role}`);
      } else {
        setTitle(`Evaluation report · #${num}`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [num, label]);

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) void loadReport();
    },
    [loadReport],
  );

  if (!num) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={compact ? "sm" : size}
          className={cn(compact && "h-8 gap-1.5 px-2", className)}
          aria-label={`View evaluation report ${num}`}
        >
          <FileText className="size-3.5 shrink-0" />
          {compact ? (
            <>
              Report <span className="text-[10px] opacity-70">[{num}]</span>
            </>
          ) : (
            <>
              View report
              <span className="ml-1 text-[10px] text-muted-foreground tabular-nums">
                [{num}]
              </span>
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[min(920px,calc(100vw-2rem))] gap-4 max-h-[90vh] flex flex-col overflow-hidden sm:max-h-[90vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="line-clamp-2 pr-8">{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Full markdown evaluation report for application {num}.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[min(70vh,calc(90vh-8rem))] min-h-[200px] rounded-md border bg-muted/30">
          <div className="p-4 text-sm">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
                <Loader2 className="size-5 animate-spin" />
                Loading report…
              </div>
            ) : error ? (
              <p className="text-destructive text-sm">{error}</p>
            ) : markdown?.trim() ? (
              <Markdown content={markdown} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Report loaded but body is empty.
              </p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
