"use client";

import * as React from "react";
import { ExternalLink, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SseStream } from "@/components/sse-stream";
import { isUsableJobUrl } from "@/lib/job-url";
import { formatDate } from "@/lib/utils";
import type { ScanRow } from "@/lib/types";

interface ScanTableProps {
  rows: ScanRow[];
  portals: string[];
}

export function ScanTable({ rows, portals }: ScanTableProps) {
  const router = useRouter();
  const [filter, setFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [portalFilter, setPortalFilter] = React.useState<string>("all");
  const [pendingEval, setPendingEval] = React.useState<ScanRow | null>(null);
  const [evalKey, setEvalKey] = React.useState(0);
  const [jdReady, setJdReady] = React.useState(false);
  const [jdText, setJdText] = React.useState<string | null>(null);
  const [jdError, setJdError] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const f = filter.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && (r.status || "added") !== statusFilter) {
        return false;
      }
      if (portalFilter !== "all" && r.portal !== portalFilter) return false;
      if (!f) return true;
      const hay = `${r.company} ${r.title} ${r.url}`.toLowerCase();
      return hay.includes(f);
    });
  }, [rows, filter, statusFilter, portalFilter]);

  const startEval = async (row: ScanRow) => {
    setPendingEval(row);
    setEvalKey((k) => k + 1);
    setJdReady(false);
    setJdText(null);
    setJdError(null);

    try {
      const res = await fetch("/api/jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: row.url }),
      });
      const json = await res.json();
      if (!res.ok) {
        setJdError(json.error ?? `HTTP ${res.status}`);
      } else {
        setJdText(json.text as string);
      }
    } catch (e) {
      setJdError((e as Error).message);
    } finally {
      setJdReady(true);
    }
  };

  const onDone = async (_full: string, exitCode: number) => {
    if (exitCode !== 0) {
      toast.error("Evaluation finished with non-zero exit.");
      return;
    }
    // Update the scan-history row to status=Evaluated.
    if (pendingEval) {
      try {
        await fetch("/api/scan-history/status", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: pendingEval.url,
            status: "Evaluated",
          }),
        });
      } catch {
        // Non-fatal — status updates are best-effort.
      }
    }
    toast.success("Evaluation complete.");
    router.refresh();
  };

  const statuses = Array.from(new Set(rows.map((r) => r.status || "added")));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Filter by company, title, URL…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-md"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="min-w-32">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={portalFilter} onValueChange={setPortalFilter}>
          <SelectTrigger className="min-w-32">
            <SelectValue placeholder="Portal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {portals.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground self-center ml-auto">
          {filtered.length} of {rows.length} jobs
        </span>
      </div>

      <Card className="px-0 py-0 gap-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-28">Portal</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-28">First seen</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-sm text-muted-foreground py-12"
                >
                  No matching jobs.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={`${r.url || "missing"}:${r.company}:${r.title}`}>
                  <TableCell className="font-medium truncate max-w-xs">
                    {r.company}
                  </TableCell>
                  <TableCell className="truncate max-w-md text-sm">
                    {r.title}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.portal}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        (r.status || "added") === "Evaluated"
                          ? "success"
                          : (r.status || "added") === "added"
                            ? "secondary"
                            : "outline"
                      }
                      className="text-[10px]"
                    >
                      {r.status || "added"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {formatDate(r.firstSeen)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end items-center gap-1">
                      <Button asChild variant="ghost" size="icon">
                        {isUsableJobUrl(r.url) ? (
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open job"
                          >
                            <ExternalLink className="size-3.5" />
                          </a>
                        ) : (
                          <span title="No valid job URL available">
                            <ExternalLink className="size-3.5 opacity-40" />
                          </span>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pendingEval !== null || !isUsableJobUrl(r.url)}
                        onClick={() => startEval(r)}
                      >
                        <Zap className="size-3.5 text-amber-500" />
                        Evaluate
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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
          {!jdReady ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Fetching JD…
            </div>
          ) : jdError || !jdText ? (
            <p className="text-sm text-destructive">
              Couldn&apos;t fetch JD: {jdError ?? "empty body"}.
            </p>
          ) : (
            <SseStream
              key={evalKey}
              url="/api/eval/stream"
              body={{ jdText, sourceUrl: pendingEval.url }}
              label={`Evaluating ${pendingEval.company}`}
              onDone={onDone}
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}
