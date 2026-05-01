"use client";

import * as React from "react";
import { Loader2, Mail, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ApplicationRow } from "@/lib/types";

interface HiringManagerOutreachDialogProps {
  row: ApplicationRow;
}

interface OutreachConfig {
  canGenerate: boolean;
  canSend: boolean;
  fromEmail: string | null;
}

export function HiringManagerOutreachDialog({
  row,
}: HiringManagerOutreachDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [config, setConfig] = React.useState<OutreachConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = React.useState(false);
  const [to, setTo] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [genPending, setGenPending] = React.useState(false);
  const [sendPending, setSendPending] = React.useState(false);

  const fetchOutreachConfig = React.useCallback(() => {
    setLoadingConfig(true);
    fetch("/api/outreach/config")
      .then((res) => res.json())
      .then((data) =>
        setConfig({
          canGenerate: Boolean(data.canGenerate),
          canSend: Boolean(data.canSend),
          fromEmail: typeof data.fromEmail === "string" ? data.fromEmail : null,
        }),
      )
      .catch(() =>
        setConfig({
          canGenerate: false,
          canSend: false,
          fromEmail: null,
        }),
      )
      .finally(() => setLoadingConfig(false));
  }, []);

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) {
        setTo("");
        setSubject("");
        setBody("");
        setGenPending(false);
        setSendPending(false);
        return;
      }
      fetchOutreachConfig();
    },
    [fetchOutreachConfig],
  );

  const generateDraft = async () => {
    setGenPending(true);
    try {
      const res = await fetch("/api/outreach/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: row.company,
          role: row.role,
          reportPath: row.reportPath || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSubject(String(data.subject ?? ""));
      setBody(String(data.body ?? ""));
      toast.success("Draft generated — edit before sending.");
    } catch (e) {
      toast.error(`Could not generate: ${(e as Error).message}`);
    } finally {
      setGenPending(false);
    }
  };

  const sendMail = async () => {
    setSendPending(true);
    try {
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to.trim(),
          subject: subject.trim(),
          body: body.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success("Message sent.");
      handleOpenChange(false);
    } catch (e) {
      toast.error(`Send failed: ${(e as Error).message}`);
    } finally {
      setSendPending(false);
    }
  };

  const canSendResolved =
    config?.canSend && to.trim().length > 3 && subject.trim() && body.trim();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => handleOpenChange(true)}
        className="gap-1.5"
      >
        <Mail className="size-3.5" />
        Reach hiring team
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[calc(100dvh-2rem)] gap-4 overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Hiring-team email</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-muted-foreground text-sm">
                <p>
                  Formal draft tailored to{" "}
                  <span className="text-foreground font-medium">
                    {row.company}
                  </span>
                  · {row.role}. Only reach out where it is appropriate —
                  personalization beats volume.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 overflow-y-auto pr-1 min-h-0 text-sm flex-1">
            {loadingConfig ? (
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" />
                Loading mail settings…
              </p>
            ) : (
              <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-1 text-xs">
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <Sparkles className="size-3.5 shrink-0" />
                  <span className="font-medium text-foreground">Setup</span>
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                  <li>
                    Draft generation needs{" "}
                    <code className="rounded bg-muted px-1 py-px">OPENAI_API_KEY</code>{" "}
                    (repo <code>.env</code> or env).
                  </li>
                  <li>
                    Sending requires{" "}
                    <code className="rounded bg-muted px-1 py-px">SMTP_HOST</code>,{" "}
                    <code className="rounded bg-muted px-1 py-px">SMTP_USER</code>,{" "}
                    <code className="rounded bg-muted px-1 py-px">SMTP_PASSWORD</code>{" "}
                    (and optionally <code className="rounded bg-muted px-1 py-px">SMTP_PORT</code>).{" "}
                    Your sender is{" "}
                    <span className="text-foreground">
                      {config?.fromEmail ?? "— add candidate.email"}
                    </span>
                    .
                  </li>
                </ul>
                {!config?.canGenerate ? (
                  <p className="text-amber-700 dark:text-amber-400">
                    Generate unavailable until model provider is configured.
                  </p>
                ) : null}
                {!config?.canSend ? (
                  <p className="text-amber-700 dark:text-amber-400">
                    Send unavailable until SMTP env vars are set.
                  </p>
                ) : null}
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor={`reach-to-${row.num}`}>To (recipient email)</Label>
              <Input
                id={`reach-to-${row.num}`}
                type="email"
                placeholder="hiring.manager@company.com"
                autoComplete="off"
                spellCheck={false}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={`reach-sub-${row.num}`}>Subject</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  disabled={genPending || !config?.canGenerate}
                  onClick={() => generateDraft()}
                >
                  {genPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  Generate draft
                </Button>
              </div>
              <Input
                id={`reach-sub-${row.num}`}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={`reach-body-${row.num}`}>Message</Label>
              <Textarea
                id={`reach-body-${row.num}`}
                className="min-h-[240px] text-sm leading-relaxed font-serif"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                spellCheck
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between sm:gap-4 border-t pt-4">
            <p className="text-[11px] text-muted-foreground text-left mr-auto max-w-xl">
              You approve every send — this does not autopilot cold outreach at
              scale.
            </p>
            <div className="flex gap-2 shrink-0">
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  navigator.clipboard
                    .writeText(
                      `Subject: ${subject}\n\n${body}`.trim(),
                    )
                    .then(() => toast.success("Copied to clipboard"))
                    .catch(() => toast.error("Copy failed"))
                }
                disabled={!subject.trim() || !body.trim()}
              >
                Copy
              </Button>
              <Button
                type="button"
                disabled={sendPending || !canSendResolved}
                onClick={() => sendMail()}
                className="gap-1.5"
              >
                {sendPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Send email
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
