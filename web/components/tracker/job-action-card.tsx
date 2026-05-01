"use client";

import * as React from "react";
import {
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  PackagePlus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SseStream } from "@/components/sse-stream";
import { ViewReportButton } from "@/components/report/view-report-button";
import { HiringManagerOutreachDialog } from "@/components/tracker/hiring-manager-outreach-dialog";
import type { ApplicationRow } from "@/lib/types";

interface JobActionCardProps {
  row: ApplicationRow;
  cursorModel?: string;
}

type DocKind = "cv" | "cl" | "both";

type PendingGen =
  | { kind: DocKind; regenerate: boolean }
  | null;

export function JobActionCard({ row, cursorModel }: JobActionCardProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState<PendingGen>(null);
  // bumpKey forces SseStream to remount on each new request so the same
  // user can run, finish, then run again without stale state.
  const [bumpKey, setBumpKey] = React.useState(0);

  const applied = row.status.trim() === "Applied";
  /** Replace on-disk tailored PDFs only before you mark the row Applied. */
  const canOverwrite = !applied;

  const trigger = (kind: DocKind, regenerate = false) => {
    setPending({ kind, regenerate });
    setBumpKey((k) => k + 1);
  };

  const onDone = (fullText: string, exitCode: number) => {
    setPending(null);
    if (exitCode !== 0) {
      const lines = fullText.trim().split("\n").filter(Boolean);
      const warned = [...lines].reverse().find((l) => l.includes("⚠️"));
      const snippet = (warned ?? lines.at(-1) ?? "").slice(0, 200);
      toast.error(
        snippet
          ? `Generation failed: ${snippet}`
          : "Generation failed or stopped early — scroll the stream for details.",
      );
      return;
    }
    toast.success("Tailored PDFs saved — check Documents & tracker downloads.");
    router.refresh();
  };

  const onError = (msg: string) => {
    setPending(null);
    toast.error(`Generation failed: ${msg}`);
  };

  return (
    <Card className="px-6 py-5 gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold truncate">{row.company}</span>
            <span className="text-muted-foreground">—</span>
            <span className="truncate">{row.role}</span>
            {row.derivedStatus !== row.status ? (
              <Badge variant="success" className="text-[10px]">
                {row.derivedStatus}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                {row.status}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            #{row.num} · {row.score || "no score"}{" "}
            {row.reportPath ? (
              <>
                · <code className="text-[10px]">{row.reportPath}</code>
              </>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
          {row.reportNum ? (
            <ViewReportButton reportNum={row.reportNum} variant="secondary" />
          ) : null}
          {row.url ? (
            <Button asChild variant="outline" size="sm">
              <a
                href={row.url}
                target="_blank"
                rel="noopener noreferrer"
                className="gap-1.5"
              >
                <ExternalLink className="size-3.5" />
                Apply
              </a>
            </Button>
          ) : null}
          <HiringManagerOutreachDialog row={row} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {row.cvAtsDownload ? (
          <Button asChild variant="secondary" size="sm">
            <a href={row.cvAtsDownload} download>
              <Download className="size-4" />
              ATS CV
            </a>
          </Button>
        ) : null}
        {row.cvAtsDocxDownload ? (
          <Button asChild variant="outline" size="sm">
            <a href={row.cvAtsDocxDownload} download>
              <Download className="size-4" />
              ATS Word
            </a>
          </Button>
        ) : null}
        {row.cvFullDownload ? (
          <Button asChild variant="secondary" size="sm">
            <a href={row.cvFullDownload} download>
              <Download className="size-4" />
              Full CV
            </a>
          </Button>
        ) : null}
        {row.cvFullDocxDownload ? (
          <Button asChild variant="outline" size="sm">
            <a href={row.cvFullDocxDownload} download>
              <Download className="size-4" />
              Full Word
            </a>
          </Button>
        ) : null}
        {row.hasCvLegacyOnly && row.cvLegacyDownload ? (
          <Button asChild variant="secondary" size="sm">
            <a href={row.cvLegacyDownload} download>
              <Download className="size-4" />
              CV (legacy)
            </a>
          </Button>
        ) : null}
        {!row.hasCvSuite ? (
          <Button
            size="sm"
            onClick={() => trigger("cv")}
            disabled={pending !== null}
          >
            {pending?.kind === "cv" && !pending.regenerate ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileText className="size-4" />
            )}
            {row.hasCv ? "Complete CV suite" : "Generate CV"}
          </Button>
        ) : null}
        {row.hasCl && row.clDownload ? (
          <Button asChild variant="secondary" size="sm">
            <a href={row.clDownload} download>
              <Download className="size-4" />
              Download Cover Letter
            </a>
          </Button>
        ) : null}
        {row.clDocxDownload ? (
          <Button asChild variant="outline" size="sm">
            <a href={row.clDocxDownload} download>
              <Download className="size-4" />
              Cover Letter (Word)
            </a>
          </Button>
        ) : null}
        {!(row.hasCl && row.clDownload) ? (
          <Button
            size="sm"
            onClick={() => trigger("cl")}
            disabled={pending !== null}
          >
            {pending?.kind === "cl" && !pending.regenerate ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Mail className="size-4" />
            )}
            Generate Cover Letter
          </Button>
        ) : null}
        {!row.hasCvSuite || !row.hasCl ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => trigger("both")}
            disabled={pending !== null}
          >
            {pending?.kind === "both" && !pending.regenerate ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PackagePlus className="size-4" />
            )}
            Generate CVs + letter
          </Button>
        ) : (
          <Badge
            variant="success"
            className="self-center justify-center w-full text-xs"
          >
            <Sparkles className="size-3" />
            Ready to apply
          </Badge>
        )}
      </div>

      {canOverwrite &&
      (row.hasCvSuite || row.hasCl || row.hasCvLegacyOnly) ? (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-border/60">
          {row.hasCvSuite || row.hasCvLegacyOnly ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => trigger("cv", true)}
              disabled={pending !== null}
              className="gap-1.5"
            >
              {pending?.kind === "cv" && pending.regenerate ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Regenerate CVs
            </Button>
          ) : null}
          {row.hasCl ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => trigger("cl", true)}
              disabled={pending !== null}
              className="gap-1.5"
            >
              {pending?.kind === "cl" && pending.regenerate ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Regenerate letter
            </Button>
          ) : null}
          {(row.hasCvSuite || row.hasCvLegacyOnly) && row.hasCl ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => trigger("both", true)}
              disabled={pending !== null}
              className="gap-1.5 text-muted-foreground"
            >
              {pending?.kind === "both" && pending.regenerate ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Regenerate CVs + letter
            </Button>
          ) : null}
        </div>
      ) : null}

      {applied && (row.hasCvSuite || row.hasCl) ? (
        <p className="text-[11px] text-muted-foreground pt-1">
          Applied — tailored PDFs are not regenerated (locked to what you
          submitted).
        </p>
      ) : null}

      {pending !== null ? (
        <SseStream
          key={`${row.num}-${pending.kind}-${pending.regenerate}-${bumpKey}`}
          url="/api/docs/generate"
          body={{
            applicationNum: row.num,
            kind: pending.kind,
            company: row.company,
            role: row.role,
            reportNum: row.reportNum || undefined,
            reportRel: row.reportPath || undefined,
            regenerate: pending.regenerate,
            canonicalStatus: row.status,
            model: cursorModel,
          }}
          label={streamLabel(pending)}
          onDone={onDone}
          onError={onError}
        />
      ) : null}
    </Card>
  );
}

function streamLabel(p: NonNullable<PendingGen>): string {
  const base =
    p.kind === "both"
      ? "ATS + full CVs + cover letter"
      : p.kind === "cv"
        ? "ATS + full-length CVs"
        : "Cover letter";
  return p.regenerate ? `Regenerate: ${base}` : base;
}
