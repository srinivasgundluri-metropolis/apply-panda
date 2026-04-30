"use client";

import * as React from "react";
import { ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CANONICAL_STATES, type ApplicationRow } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { ViewReportButton } from "@/components/report/view-report-button";

interface ApplicationsTableProps {
  rows: ApplicationRow[];
}

function statusBadgeVariant(
  status: string,
):
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning" {
  switch (status) {
    case "Applied":
    case "Responded":
      return "default";
    case "Interview":
    case "Offer":
      return "success";
    case "Rejected":
    case "Discarded":
    case "SKIP":
      return "destructive";
    case "Evaluated":
      return "warning";
    default:
      return "secondary";
  }
}

export function ApplicationsTable({ rows }: ApplicationsTableProps) {
  const router = useRouter();
  const [filter, setFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [updatingNum, setUpdatingNum] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const f = filter.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!f) return true;
      const hay = `${r.company} ${r.role} ${r.notes} ${r.status}`.toLowerCase();
      return hay.includes(f);
    });
  }, [rows, filter, statusFilter]);

  const updateStatus = async (num: string, newStatus: string) => {
    setUpdatingNum(num);
    try {
      const res = await fetch(`/api/applications/${num}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      toast.success(`Status updated to ${newStatus}`);
      router.refresh();
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setUpdatingNum(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Filter by company, role, notes…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-md"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="min-w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {CANONICAL_STATES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground self-center ml-auto">
          {filtered.length} of {rows.length} rows
        </span>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-28">Apply</TableHead>
              <TableHead className="w-20">Score</TableHead>
              <TableHead className="w-44">Status</TableHead>
              <TableHead className="w-24">Docs</TableHead>
              <TableHead className="w-[7.5rem]">Report</TableHead>
              <TableHead className="w-28">Date</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="text-center text-sm text-muted-foreground py-12"
                >
                  No matching rows.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.num || r.company + r.role}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {r.num}
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex flex-col leading-tight">
                      <span className="truncate max-w-xs">{r.company}</span>
                      {r.derivedStatus !== r.status ? (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 truncate">
                          {r.derivedStatus}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm truncate max-w-xs">
                    {r.role}
                  </TableCell>
                  <TableCell>
                    {r.url ? (
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="gap-1.5"
                        >
                          <ExternalLink className="size-3.5" />
                          Apply
                        </a>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{r.score || "—"}</TableCell>
                  <TableCell>
                    <Select
                      value={r.status}
                      onValueChange={(v) => updateStatus(r.num, v)}
                      disabled={updatingNum === r.num}
                    >
                      <SelectTrigger size="sm" className="w-full">
                        <Badge
                          variant={statusBadgeVariant(r.status)}
                          className="text-[10px] px-2"
                        >
                          {r.status || "—"}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {CANONICAL_STATES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-xs">
                      {r.hasCvLegacyOnly ? (
                        <span
                          className={cn(
                            "flex items-center gap-0.5",
                            r.hasCv
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground",
                          )}
                          title="Tailored CV (legacy single PDF)"
                        >
                          {r.hasCv ? (
                            <CheckCircle2 className="size-3" />
                          ) : (
                            <XCircle className="size-3" />
                          )}
                          CV
                        </span>
                      ) : (
                        <>
                          <span
                            className={cn(
                              "flex items-center gap-0.5",
                              r.hasCvAts
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-muted-foreground",
                            )}
                            title="ATS-tailored CV"
                          >
                            {r.hasCvAts ? (
                              <CheckCircle2 className="size-3" />
                            ) : (
                              <XCircle className="size-3" />
                            )}
                            A
                          </span>
                          <span
                            className={cn(
                              "flex items-center gap-0.5",
                              r.hasCvFull
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-muted-foreground",
                            )}
                            title="Full-length CV"
                          >
                            {r.hasCvFull ? (
                              <CheckCircle2 className="size-3" />
                            ) : (
                              <XCircle className="size-3" />
                            )}
                            F
                          </span>
                        </>
                      )}
                      <span
                        className={cn(
                          "flex items-center gap-0.5",
                          r.hasCl
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground",
                        )}
                        title="Cover letter"
                      >
                        {r.hasCl ? (
                          <CheckCircle2 className="size-3" />
                        ) : (
                          <XCircle className="size-3" />
                        )}
                        CL
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="p-2">
                    {r.reportNum ? (
                      <ViewReportButton
                        reportNum={r.reportNum}
                        compact
                        variant="ghost"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {formatDate(r.date)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                    {r.notes}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
