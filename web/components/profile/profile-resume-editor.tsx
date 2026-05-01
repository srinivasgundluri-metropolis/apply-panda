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

interface Props {
  initial: Profile;
  /** Raw contents of repo-root `cv.md` — your experience narrative. */
  initialCvMarkdown: string;
}

/**
 * Combined editor for `config/profile.yml` and `cv.md` with one **Update**
 * action so tailored CV/cover-letter runs always read fresh canonical data.
 *
 * Tailored document generation expects:
 * - **ATS + Full CV** — two PDFs per role (`-ats`/`-full` suffix); see modes/pdf.md
 * - Cover letter remains a separate PDF beside them
 */
export function ProfileResumeEditor({ initial, initialCvMarkdown }: Props) {
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

  const [portalsJson, setPortalsJson] = React.useState(() => {
    const p = initial.portals;
    if (p && typeof p === "object") {
      return JSON.stringify(p, null, 2);
    }
    return "";
  });

  const [cvMarkdown, setCvMarkdown] = React.useState(initialCvMarkdown);

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
      const payload: Profile = {
        candidate: {
          full_name: fullName.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          location: location.trim() || undefined,
          timezone: timezone.trim() || undefined,
          linkedin: linkedin.trim() || undefined,
          github: github.trim() || undefined,
          website: website.trim() || undefined,
        },
        target_roles: {
          primary: splitList(primary),
          secondary: splitList(secondary),
          archetypes: splitList(archetypes),
        },
        narrative: {
          one_liner: oneLiner.trim() || undefined,
          superpower: superpower.trim() || undefined,
          proof_points: splitList(proofPoints),
          deal_breakers: splitList(dealBreakers),
        },
      };

      if (portalsJson.trim() === "") {
        if (initial.portals) {
          payload.portals = null;
        }
      } else {
        try {
          const parsed = JSON.parse(portalsJson) as PortalsYamlConfig;
          if (
            !Array.isArray(parsed.tracked_companies) ||
            parsed.tracked_companies.length === 0
          ) {
            throw new Error("`tracked_companies` must be a non-empty array.");
          }
          payload.portals = parsed;
        } catch (err) {
          toast.error(
            `Portals JSON invalid: ${(err as Error).message}. Fix the Portals tab or clear the field.`,
          );
          setSaving(false);
          return;
        }
      }

      const [resProfile, resCv] = await Promise.all([
        fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        fetch("/api/cv", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markdown: cvMarkdown }),
        }),
      ]);

      const profileBody = (await resProfile.json().catch(() => ({}))) as {
        profile?: Profile;
        error?: string;
      };

      if (!resProfile.ok) {
        throw new Error(profileBody.error ?? `Profile HTTP ${resProfile.status}`);
      }
      if (!resCv.ok) {
        const j = await resCv.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `CV HTTP ${resCv.status}`);
      }

      const merged = profileBody.profile;
      if (merged?.portals && typeof merged.portals === "object") {
        setPortalsJson(JSON.stringify(merged.portals, null, 2));
      } else {
        setPortalsJson("");
      }

      toast.success("Profile, optional portals config, and résumé updated.");
      router.refresh();
    } catch (err) {
      toast.error(`Save failed: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={saveAll} className="flex flex-col gap-6">
      <Tabs defaultValue="resume" className="gap-4">
        <TabsList className="w-fit flex-wrap">
          <TabsTrigger value="resume">Résumé (`cv.md`)</TabsTrigger>
          <TabsTrigger value="yaml">Targeting (`profile.yml`)</TabsTrigger>
          <TabsTrigger value="portals">Portals (`portals.yml`)</TabsTrigger>
        </TabsList>

        <TabsContent value="resume" className="mt-2">
          <Card>
            <CardHeader>
              <CardTitle>Résumé / experience narrative</CardTitle>
              <CardDescription>
                Edit Markdown for <code className="text-xs">cv.md</code> in the
                repo root — bullet roles, impact metrics, projects, and education.
                The tailored-CV generator reads this verbatim and produces{" "}
                <strong>two</strong> PDFs per role: an{" "}
                <strong>ATS-optimized</strong> variant and a{" "}
                <strong>full-length</strong> variant (see modes/pdf.md).
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
            </CardHeader>
            <CardContent className="grid gap-4">
              <Field
                label="Primary roles (comma-separated)"
                id="primary"
                value={primary}
                onChange={setPrimary}
                placeholder="Senior Backend Engineer"
              />
              <Field
                label="Secondary roles (comma-separated)"
                id="secondary"
                value={secondary}
                onChange={setSecondary}
              />
              <Field
                label="Archetypes (comma-separated)"
                id="archetypes"
                value={archetypes}
                onChange={setArchetypes}
                placeholder="API platform"
              />
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

        <TabsContent value="portals" className="mt-2">
          <Card>
            <CardHeader>
              <CardTitle>Portal scanner (per user)</CardTitle>
              <CardDescription>
                Stored in Supabase as <code className="text-xs">profiles.data.portals</code>.
                Same JSON shape as root <code className="text-xs">portals.yml</code> (
                <code className="text-xs">tracked_companies</code>,{" "}
                <code className="text-xs">title_filter</code>). Chat <strong>Search portals</strong>{" "}
                and Pipeline <strong>Run scan</strong> use only this list — there is no shared
                default company bundle. Clear the field and save to remove saved portals (scans will
                ask you to configure again until you paste JSON and save).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={portalsJson}
                onChange={(e) => setPortalsJson(e.target.value)}
                spellCheck={false}
                className="min-h-[420px] font-mono text-xs leading-relaxed"
                placeholder={`{
  "title_filter": { "positive": ["Engineer"], "negative": ["Intern"] },
  "tracked_companies": [
    { "name": "Example", "enabled": true, "careers_url": "https://jobs.ashbyhq.com/example" }
  ]
}`}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground max-w-lg">
          One button updates your Supabase profile (including optional{" "}
          <code className="text-xs">portals</code> JSON), <code className="text-xs">cv.md</code> in
          storage, and keeps tailored CV/cover flows aligned.
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
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
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
      />
    </div>
  );
}
