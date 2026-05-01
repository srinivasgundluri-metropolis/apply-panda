"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { PortalsYamlConfig, Profile } from "@/lib/types";
import { normalizeHostedPortalsPayload } from "@/lib/hosted-profile-portals";
import {
  mergeTrackedDeduped,
  partitionTrackedAgainstCatalog,
  trackedCompaniesFromCatalogKeys,
} from "@/lib/portal-catalog-keys";
import { extraBoardsFromUrlLines } from "@/lib/extra-portal-urls";
import { EmployerBoardPicker } from "@/components/profile/employer-board-picker";

function initialEmployerUiFromPortals(portals: Profile["portals"]) {
  const norm = normalizeHostedPortalsPayload(portals ?? null);
  const tracked = norm?.tracked_companies ?? [];
  const { catalogKeys, extras } = partitionTrackedAgainstCatalog(tracked);
  const extraUrlsText = extras
    .map((e) => e.careers_url ?? e.api ?? "")
    .filter(Boolean)
    .join("\n");
  return {
    catalogKeys,
    extraUrlsText,
    companyFilter: norm?.company_filter ?? "",
    titleNegCsv: norm?.title_filter?.negative?.join(", ") ?? "",
    locNegCsv: norm?.location_filter?.negative?.join(", ") ?? "",
  };
}

interface Props {
  initial: Profile;
  /** Raw contents of repo-root `cv.md` — your experience narrative. */
  initialCvMarkdown: string;
  /** Initial tab when opening from deep links (e.g. `?tab=yaml`). */
  defaultTab?: "resume" | "yaml";
}

const CHAT_HISTORY_KEY = "career-ops:chat-history";
const CHAT_RECENT_SEARCH_KEY = "career-ops:recent-searches";

/**
 * Combined editor for `config/profile.yml` and `cv.md` with one **Update**
 * action so tailored CV/cover-letter runs always read fresh canonical data.
 *
 * Tailored document generation expects:
 * - **ATS + Full CV** — two one-page artifacts per role (`-ats`/`-full`), usually `.pdf`.
 * - Cover letter — separate one-page file per role (`-cover`).
 */
export function ProfileResumeEditor({
  initial,
  initialCvMarkdown,
  defaultTab = "resume",
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteAck, setDeleteAck] = React.useState("");
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  const [fullName, setFullName] = React.useState(
    initial.candidate?.full_name ?? "",
  );
  const [email, setEmail] = React.useState(initial.candidate?.email ?? "");
  const [phone, setPhone] = React.useState(initial.candidate?.phone ?? "");
  const [location, setLocation] = React.useState(
    initial.candidate?.location ?? "",
  );
  const [timezone, setTimezone] = React.useState(
    initial.candidate?.timezone ?? "",
  );
  const [linkedin, setLinkedin] = React.useState(
    initial.candidate?.linkedin ?? "",
  );
  const [github, setGithub] = React.useState(initial.candidate?.github ?? "");
  const [website, setWebsite] = React.useState(
    initial.candidate?.website ?? "",
  );

  const [primary, setPrimary] = React.useState(() => {
    const prim = initial.target_roles?.primary;
    if (Array.isArray(prim)) return prim.map(String).join(", ");
    if (typeof prim === "string") return prim;
    return "";
  });
  const [secondary, setSecondary] = React.useState(
    (initial.target_roles?.secondary ?? []).join(", "),
  );
  const archetypeRaw = initial.target_roles?.archetypes;
  const [archetypes, setArchetypes] = React.useState(
    Array.isArray(archetypeRaw)
      ? archetypeRaw
          .map((a: unknown) =>
            typeof a === "string"
              ? a
              : (a as { name?: string })?.name ?? JSON.stringify(a),
          )
          .join(", ")
      : "",
  );

  const [oneLiner, setOneLiner] = React.useState(
    initial.narrative?.one_liner ?? "",
  );
  const [superpower, setSuperpower] = React.useState(
    initial.narrative?.superpower ?? "",
  );
  const [proofPoints, setProofPoints] = React.useState(
    (initial.narrative?.proof_points ?? []).join("\n"),
  );
  const [dealBreakers, setDealBreakers] = React.useState(
    (initial.narrative?.deal_breakers ?? []).join("\n"),
  );

  const [selectedEmployerKeys, setSelectedEmployerKeys] = React.useState<Set<string>>(() =>
    initialEmployerUiFromPortals(initial.portals ?? null).catalogKeys,
  );
  const [extraUrlsText, setExtraUrlsText] = React.useState(
    () => initialEmployerUiFromPortals(initial.portals ?? null).extraUrlsText,
  );
  const [companyFilter, setCompanyFilter] = React.useState(
    () => initialEmployerUiFromPortals(initial.portals ?? null).companyFilter,
  );
  const [titleNegCsv, setTitleNegCsv] = React.useState(
    () => initialEmployerUiFromPortals(initial.portals ?? null).titleNegCsv,
  );
  const [locNegCsv, setLocNegCsv] = React.useState(
    () => initialEmployerUiFromPortals(initial.portals ?? null).locNegCsv,
  );

  React.useEffect(() => {
    const u = initialEmployerUiFromPortals(initial.portals ?? null);
    setSelectedEmployerKeys(u.catalogKeys);
    setExtraUrlsText(u.extraUrlsText);
    setCompanyFilter(u.companyFilter);
    setTitleNegCsv(u.titleNegCsv);
    setLocNegCsv(u.locNegCsv);
  }, [initial.portals]);

  const [cvMarkdown, setCvMarkdown] = React.useState(initialCvMarkdown);
  const cvIsEmpty = cvMarkdown.trim().length === 0;
  const resumeCoachImportPrompt =
    "Use this uploaded resume as the source of truth. Update both cv.md and profile.yml (candidate info, target_roles including archetypes, and narrative proof points). Do not invent metrics. Keep one proof point per line.";

  const splitList = (s: string): string[] =>
    s
      .split(/[,\n]/)
      .map((p) => p.trim())
      .filter(Boolean);

  const deleteAccount = async () => {
    if (deleteAck.trim().toUpperCase() !== "DELETE") {
      toast.error("Type DELETE to confirm account deletion.");
      return;
    }
    setDeleteBusy(true);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      try {
        window.localStorage.removeItem(CHAT_HISTORY_KEY);
        window.localStorage.removeItem(CHAT_RECENT_SEARCH_KEY);
      } catch {
        // ignore storage permission / private mode failures
      }
      toast.success("Account deleted. All associated data has been removed.");
      window.location.href = "/auth";
    } catch (err) {
      toast.error(`Delete failed: ${(err as Error).message}`);
    } finally {
      setDeleteBusy(false);
    }
  };

  const saveAll = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const linkedinValue = linkedin.trim();
      if (!linkedinValue) {
        toast.error("LinkedIn URL is required.");
        return;
      }
      if (!/^https?:\/\/(www\.)?linkedin\.com\/.+/i.test(linkedinValue)) {
        toast.error("LinkedIn URL must be a full https://linkedin.com/... link.");
        return;
      }
      const primaryRoles = splitList(primary);
      const secondaryRoles = splitList(secondary);
      const archetypeRoles = splitList(archetypes);
      if (primaryRoles.length === 0) {
        toast.error("Primary roles are required.");
        return;
      }
      if (secondaryRoles.length === 0) {
        toast.error("Secondary roles are required.");
        return;
      }
      if (archetypeRoles.length === 0) {
        toast.error("Archetypes are required.");
        return;
      }

      const fromCatalog = trackedCompaniesFromCatalogKeys(selectedEmployerKeys);
      const { ok: extraRows, skippedLines } = extraBoardsFromUrlLines(extraUrlsText);
      if (skippedLines.length > 0) {
        toast.warning(
          `${skippedLines.length} extra URL line(s) skipped — use Greenhouse, Ashby, Lever, or Workday board URLs only.`,
        );
      }
      const mergedTracked = mergeTrackedDeduped(fromCatalog, extraRows);
      if (mergedTracked.length === 0) {
        toast.error("Pick at least one employer from the list or add a supported careers URL below.");
        setSaving(false);
        return;
      }

      const titleNegLines = splitList(titleNegCsv);
      const locNegLines = splitList(locNegCsv);
      const cf = companyFilter.trim();
      const portalsPayload: PortalsYamlConfig = {
        tracked_companies: mergedTracked,
        ...(cf ? { company_filter: cf.slice(0, 200) } : {}),
        ...(titleNegLines.length ? { title_filter: { negative: titleNegLines } } : {}),
        ...(locNegLines.length ? { location_filter: { negative: locNegLines } } : {}),
      };

      const payload: Profile = {
        candidate: {
          full_name: fullName.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          location: location.trim() || undefined,
          timezone: timezone.trim() || undefined,
          linkedin: linkedinValue,
          github: github.trim() || undefined,
          website: website.trim() || undefined,
        },
        target_roles: {
          primary: primaryRoles,
          secondary: secondaryRoles,
          archetypes: archetypeRoles,
        },
        narrative: {
          one_liner: oneLiner.trim() || undefined,
          superpower: superpower.trim() || undefined,
          proof_points: splitList(proofPoints),
          deal_breakers: splitList(dealBreakers),
        },
        portals: portalsPayload,
      };

      const resProfile = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const profileBody = (await resProfile.json().catch(() => ({}))) as {
        profile?: Profile;
        error?: string;
      };
      const profileOk = resProfile.ok;

      const resCv = await fetch("/api/cv", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: cvMarkdown }),
      });
      const cvBody = (await resCv.json().catch(() => ({}))) as { error?: string };
      const cvOk = resCv.ok;

      if (!profileOk && !cvOk) {
        throw new Error(
          [
            profileBody.error ?? `Profile HTTP ${resProfile.status}`,
            cvBody.error ?? `CV HTTP ${resCv.status}`,
          ].join(" | "),
        );
      }
      if (!profileOk && cvOk) {
        throw new Error(profileBody.error ?? `Profile HTTP ${resProfile.status}`);
      }

      if (profileOk && cvOk) {
        toast.success("Profile and résumé updated.");
      } else {
        toast.warning(
          `Profile updated, but résumé save failed: ${cvBody.error ?? `CV HTTP ${resCv.status}`}`,
        );
      }
      router.refresh();
    } catch (err) {
      toast.error(`Save failed: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={saveAll} className="flex flex-col gap-6">
      {cvIsEmpty ? (
        <Card className="border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Start here: import your resume first
            </CardTitle>
            <CardDescription className="space-y-2 text-sm">
              <p>
                Your <code className="text-xs">cv.md</code> is empty. Go to{" "}
                <Link href="/chat" className="underline font-medium">
                  Chat
                </Link>
                , turn on <strong>Resume coach</strong>, upload your DOCX/MD resume,
                and send this prompt so it updates both{" "}
                <code className="text-xs">cv.md</code> and{" "}
                <code className="text-xs">profile.yml</code>.
              </p>
              <Textarea
                readOnly
                value={resumeCoachImportPrompt}
                rows={3}
                className="font-mono text-xs bg-background"
              />
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Tabs defaultValue={defaultTab} className="gap-4">
        <TabsList className="w-fit flex-wrap">
          <TabsTrigger value="resume">Résumé (`cv.md`)</TabsTrigger>
          <TabsTrigger value="yaml">Targeting (`profile.yml`)</TabsTrigger>
        </TabsList>

        <TabsContent value="resume" className="mt-2">
          <Card>
            <CardHeader>
              <CardTitle>Résumé / experience narrative</CardTitle>
              <CardDescription>
                Edit Markdown for <code className="text-xs">cv.md</code> in the
                repo root — bullet roles, impact metrics, projects, and education.
                The tailored-CV generator reads this verbatim and produces{" "}
                <strong>two</strong> one-page outputs per role: an{" "}
                <strong>ATS-optimized</strong> variant and a denser reader-friendly variant, exported as PDF when the server has Chromium (HTML fallback otherwise).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={cvMarkdown}
                onChange={(e) => setCvMarkdown(e.target.value)}
                spellCheck={false}
                className="min-h-[480px] font-mono text-xs leading-relaxed"
                placeholder="# Your Name&#10;&#10;## Summary&#10;&#10;## Experience&#10;- …"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="yaml" className="mt-2 flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Candidate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Full name"
                  id="full_name"
                  value={fullName}
                  onChange={setFullName}
                  placeholder="Jane Doe"
                />
                <Field
                  label="Email"
                  id="email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="jane@example.com"
                />
                <Field label="Phone" id="phone" value={phone} onChange={setPhone} />
                <Field
                  label="Location"
                  id="location"
                  value={location}
                  onChange={setLocation}
                  placeholder="San Francisco, CA"
                />
                <Field
                  label="Timezone"
                  id="timezone"
                  value={timezone}
                  onChange={setTimezone}
                  placeholder="America/Los_Angeles"
                />
                <Field
                  label="LinkedIn URL"
                  id="linkedin"
                  value={linkedin}
                  onChange={setLinkedin}
                  required
                  placeholder="https://linkedin.com/in/your-handle"
                />
                <Field
                  label="GitHub URL"
                  id="github"
                  value={github}
                  onChange={setGithub}
                />
                <Field
                  label="Website"
                  id="website"
                  value={website}
                  onChange={setWebsite}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Target roles</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                Pipeline <strong>Scan job boards</strong> and Chat ATS search match these role lines (plus{" "}
                <strong>Location</strong> under Candidate). Employer URLs live in the{" "}
                <a href="#profile-employer-boards" className="underline font-medium">
                  employer board picker
                </a>{" "}
                below (same sources as career-ops <code className="text-xs">portals.yml</code>).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Field
                label="Primary roles (comma-separated)"
                id="primary"
                value={primary}
                onChange={setPrimary}
                placeholder="Senior Backend Engineer"
                required
              />
              <Field
                label="Secondary roles (comma-separated)"
                id="secondary"
                value={secondary}
                onChange={setSecondary}
                required
              />
              <Field
                label="Archetypes (comma-separated)"
                id="archetypes"
                value={archetypes}
                onChange={setArchetypes}
                placeholder="API platform"
                required
              />
            </CardContent>
          </Card>

          <Card id="profile-employer-boards">
            <CardHeader>
              <CardTitle>Employer job boards</CardTitle>
              <CardDescription className="text-sm leading-relaxed space-y-2">
                <p>
                  Choose companies whose ATS feeds we poll (Greenhouse, Ashby, Lever, Workday). This replaces typing{" "}
                  <code className="text-xs">tracked_companies</code> by hand — we still save the same JSON under the hood.
                </p>
                <p>
                  “US-heavy” / “EU / UK” are optional shortcuts (HQ guesses), not official registry filters. Prefer{" "}
                  <strong>Select all</strong> or search when you want everything listed.
                </p>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <EmployerBoardPicker
                selectedKeys={selectedEmployerKeys}
                onSelectedKeysChange={setSelectedEmployerKeys}
              />

              <div className="grid gap-2">
                <Label htmlFor="extra_board_urls">Extra careers URLs (optional)</Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  One URL per line for boards <strong>not</strong> in the list above — same ATS types only.
                </p>
                <Textarea
                  id="extra_board_urls"
                  value={extraUrlsText}
                  onChange={(e) => setExtraUrlsText(e.target.value)}
                  spellCheck={false}
                  rows={4}
                  className="font-mono text-xs leading-relaxed"
                  placeholder={"https://job-boards.greenhouse.io/acme"}
                />
              </div>

              <div className="grid gap-1.5 max-w-xl">
                <Label htmlFor="company_filter">Narrow boards by name (optional)</Label>
                <Input
                  id="company_filter"
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                  placeholder="Substring of employer display name"
                  maxLength={200}
                />
                <p className="text-xs text-muted-foreground">
                  Same as <code className="text-xs">company_filter</code> in portals.yml — limits which selected boards run.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="title_neg">Exclude title keywords (optional)</Label>
                  <Input
                    id="title_neg"
                    value={titleNegCsv}
                    onChange={(e) => setTitleNegCsv(e.target.value)}
                    placeholder="Junior, Intern, …"
                  />
                  <p className="text-xs text-muted-foreground">Comma-separated · maps to title_filter.negative</p>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="loc_neg">Exclude location keywords (optional)</Label>
                  <Input
                    id="loc_neg"
                    value={locNegCsv}
                    onChange={(e) => setLocNegCsv(e.target.value)}
                    placeholder="EMEA, Poland, …"
                  />
                  <p className="text-xs text-muted-foreground">Comma-separated · maps to location_filter.negative</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Narrative</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Field
                label="One-liner"
                id="one_liner"
                value={oneLiner}
                onChange={setOneLiner}
              />
              <Field
                label="Superpower"
                id="superpower"
                value={superpower}
                onChange={setSuperpower}
              />
              <div className="grid gap-1.5">
                <Label htmlFor="proof_points">
                  Proof points (one per line)
                </Label>
                <Textarea
                  id="proof_points"
                  value={proofPoints}
                  onChange={(e) => setProofPoints(e.target.value)}
                  rows={4}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="deal_breakers">
                  Deal-breakers (one per line)
                </Label>
                <Textarea
                  id="deal_breakers"
                  value={dealBreakers}
                  onChange={(e) => setDealBreakers(e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground max-w-lg">
          Saves targeting, employer board picks, and résumé markdown so ATS scans stay aligned with career-ops.
        </p>
        <Button type="submit" disabled={saving} size="lg">
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Update profile & résumé
        </Button>
      </div>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Permanently delete your account and all corresponding data, including
            profile, resume, applications, reports, documents, and scan history.
            This action cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground">
            Before deleting, review our{" "}
            <Link href="/terms" className="underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="destructive">
                Delete account
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete account permanently?</DialogTitle>
                <DialogDescription>
                  Deleting your account will permanently delete all data
                  corresponding to your user: profile, resume, applications,
                  reports, generated documents, and scan history.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="delete-confirm">
                  Type <code>DELETE</code> to confirm
                </Label>
                <Input
                  id="delete-confirm"
                  value={deleteAck}
                  onChange={(e) => setDeleteAck(e.target.value)}
                  placeholder="DELETE"
                  disabled={deleteBusy}
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeleteOpen(false)}
                  disabled={deleteBusy}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={deleteAccount}
                  disabled={deleteBusy || deleteAck.trim().toUpperCase() !== "DELETE"}
                >
                  {deleteBusy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Deleting…
                    </>
                  ) : (
                    "Yes, delete my account"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </form>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  type = "text",
  placeholder,
  required = false,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
}
