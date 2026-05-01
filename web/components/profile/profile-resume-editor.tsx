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
import type { Profile } from "@/lib/types";
import {
  AtsBoardsEditor,
  type AtsBoardsEditorHandle,
} from "@/components/profile/ats-boards-editor";

interface Props {
  initial: Profile;
  /** Raw contents of repo-root `cv.md` — your experience narrative. */
  initialCvMarkdown: string;
  /** Initial tab when opening from deep links (e.g. `?tab=boards`). */
  defaultTab?: "resume" | "yaml" | "portals";
}

/**
 * Combined editor for `config/profile.yml` and `cv.md` with one **Update**
 * action so tailored CV/cover-letter runs always read fresh canonical data.
 *
 * Tailored document generation expects:
 * - **ATS + Full CV** — two PDFs per role (`-ats`/`-full` suffix); see modes/pdf.md
 * - Cover letter remains a separate PDF beside them
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

  const atsBoardsRef = React.useRef<AtsBoardsEditorHandle>(null);
  const portalsSeed = JSON.stringify(initial.portals ?? null);

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

      if (atsBoardsRef.current?.hasIncompleteCompanyRows()) {
        toast.error(
          "ATS boards: each row needs a supported careers slug or URL. Display labels are optional—fill the board URL or remove broken rows.",
        );
        setSaving(false);
        return;
      }
      const portalsFromForm = atsBoardsRef.current?.getConfig() ?? null;
      if (portalsFromForm) {
        payload.portals = portalsFromForm;
      } else if (initial.portals) {
        payload.portals = null;
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

      toast.success("Profile, ATS boards, and résumé updated.");
      router.refresh();
    } catch (err) {
      toast.error(`Save failed: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={saveAll} className="flex flex-col gap-6">
      <Tabs defaultValue={defaultTab} className="gap-4">
        <TabsList className="w-fit flex-wrap">
          <TabsTrigger value="resume">Résumé (`cv.md`)</TabsTrigger>
          <TabsTrigger value="yaml">Targeting (`profile.yml`)</TabsTrigger>
          <TabsTrigger value="portals">ATS job boards</TabsTrigger>
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
          <Card id="profile-ats-boards" className="scroll-mt-24">
            <CardHeader>
              <CardTitle>ATS job boards</CardTitle>
              <CardDescription className="space-y-2 text-sm leading-relaxed">
                <p>
                  Scanning is driven by <strong>title and location keywords</strong>. Optional ATS board URLs
                  focus which employers&apos; postings we poll; leave boards empty for a curated default ATS
                  list (still narrowed by titles/locations). Supports Greenhouse, Ashby, Lever, and Workday (
                  <code className="text-muted-foreground">myworkdayjobs.com</code>
                  ). Saved privately and powers{" "}
                  <strong>Chat → search job boards</strong> and <strong>Pipeline → Scan job boards</strong>.
                </p>
                <p>
                  Use the form below — no JSON required (<code className="text-xs">title_filter</code>,{" "}
                  <code className="text-xs">location_filter</code>, tracked boards). To clear boards, delete
                  every row and save; titles/locations alone can still persist.
                </p>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AtsBoardsEditor ref={atsBoardsRef} portalsSeed={portalsSeed} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground max-w-lg">
          Saves targeting, résumé markdown, and your ATS board list so scans, search, and tailored
          documents stay in sync.
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
