"use client";

import * as React from "react";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { Profile } from "@/lib/types";

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

  const [cvMarkdown, setCvMarkdown] = React.useState(initialCvMarkdown);

  const splitList = (s: string): string[] =>
    s
      .split(/[,\n]/)
      .map((p) => p.trim())
      .filter(Boolean);

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

      if (!resProfile.ok) {
        const j = await resProfile.json().catch(() => ({}));
        throw new Error(j.error ?? `Profile HTTP ${resProfile.status}`);
      }
      if (!resCv.ok) {
        const j = await resCv.json().catch(() => ({}));
        throw new Error(j.error ?? `CV HTTP ${resCv.status}`);
      }

      toast.success("Profile YAML and cv.md updated.");
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
        <TabsList className="w-fit">
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
      </Tabs>

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground max-w-lg">
          One button writes <code>config/profile.yml</code> (deep-merge) and{" "}
          <code>cv.md</code> next time you generate tailored ATS + Full CV PDFs from
          the Tracker, those files are the sources of truth.
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
