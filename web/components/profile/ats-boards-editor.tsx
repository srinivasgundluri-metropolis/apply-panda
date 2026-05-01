"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PortalsTrackedCompany, PortalsYamlConfig } from "@/lib/types";

export type AtsPlatform = "ashby" | "greenhouse" | "lever" | "custom";

export type CompanyFormRow = {
  id: string;
  name: string;
  platform: AtsPlatform;
  /** Board slug, or full careers URL when platform is custom */
  slugOrUrl: string;
  enabled: boolean;
};

type TitlePreset = "any" | "engineering" | "ml_ai" | "product" | "custom";

const TITLE_PRESET_LABEL: Record<TitlePreset, string> = {
  any: "Any job title (no keyword filter)",
  engineering: "Engineering & platform",
  ml_ai: "ML & AI",
  product: "Product & program",
  custom: "Custom (edit list below)",
};

const TITLE_PRESET_POSITIVE: Record<
  Exclude<TitlePreset, "any" | "custom">,
  string[]
> = {
  engineering: [
    "Engineer",
    "Software",
    "Backend",
    "Platform",
    "Infrastructure",
    "DevOps",
    "SRE",
    "Security Engineer",
  ],
  ml_ai: [
    "Machine Learning",
    "ML",
    "AI",
    "Deep Learning",
    "LLM",
    "MLOps",
    "Research Scientist",
    "Applied Scientist",
  ],
  product: [
    "Product Manager",
    "Program Manager",
    "TPM",
    "Technical Program",
    "Product Lead",
  ],
};

const NEGATIVE_PRESETS = [
  { key: "Intern", label: "Intern" },
  { key: "Junior", label: "Junior" },
  { key: ".NET", label: ".NET" },
  { key: "Java ", label: "Java (non-android)" },
  { key: "PHP", label: "PHP" },
  { key: "iOS", label: "iOS" },
  { key: "Android", label: "Android" },
] as const;

function newRowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function inferRowFromCompany(c: PortalsTrackedCompany): CompanyFormRow {
  const url = (c.careers_url ?? "").trim();
  const name = (c.name ?? "").trim();
  if (!url) {
    return {
      id: newRowId(),
      name,
      platform: "custom",
      slugOrUrl: "",
      enabled: c.enabled !== false,
    };
  }
  const ashby = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/i);
  if (ashby) {
    return {
      id: newRowId(),
      name,
      platform: "ashby",
      slugOrUrl: ashby[1],
      enabled: c.enabled !== false,
    };
  }
  const lever = url.match(/jobs\.lever\.co\/([^/?#]+)/i);
  if (lever) {
    return {
      id: newRowId(),
      name,
      platform: "lever",
      slugOrUrl: lever[1],
      enabled: c.enabled !== false,
    };
  }
  const gh = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/i);
  if (gh) {
    return {
      id: newRowId(),
      name,
      platform: "greenhouse",
      slugOrUrl: gh[1],
      enabled: c.enabled !== false,
    };
  }
  return {
    id: newRowId(),
    name,
    platform: "custom",
    slugOrUrl: url,
    enabled: c.enabled !== false,
  };
}

export function buildCareersUrl(row: CompanyFormRow): string {
  const raw = row.slugOrUrl.trim();
  if (!raw) return "";
  if (row.platform === "custom") return raw;
  const slug = raw.replace(/^\/+/, "").split("/")[0] ?? "";
  if (!slug) return "";
  switch (row.platform) {
    case "ashby":
      return `https://jobs.ashbyhq.com/${slug}`;
    case "lever":
      return `https://jobs.lever.co/${slug}`;
    case "greenhouse":
      return `https://job-boards.greenhouse.io/${slug}`;
    default:
      return raw;
  }
}

function rowsToTrackedCompanies(rows: CompanyFormRow[]): PortalsTrackedCompany[] {
  return rows
    .map((r) => {
      const careers_url = buildCareersUrl(r);
      if (!r.name.trim() || !careers_url) return null;
      return {
        name: r.name.trim(),
        enabled: r.enabled,
        careers_url,
      };
    })
    .filter(Boolean) as PortalsTrackedCompany[];
}

function parsePositiveLines(s: string): string[] {
  return s
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function positiveLinesFromPreset(preset: TitlePreset): string {
  if (preset === "any" || preset === "custom") return "";
  return TITLE_PRESET_POSITIVE[preset].join("\n");
}

function detectPresetFromPositives(lines: string[]): TitlePreset {
  const norm = (s: string) => s.trim().toLowerCase();
  const set = new Set(lines.map(norm).filter(Boolean));
  if (set.size === 0) return "any";
  for (const key of ["engineering", "ml_ai", "product"] as const) {
    const preset = TITLE_PRESET_POSITIVE[key].map(norm);
    const match = preset.filter((p) => set.has(p)).length;
    if (match >= Math.min(3, preset.length) && set.size <= preset.length + 2) {
      return key;
    }
  }
  return "custom";
}

export function parsePortalsToFormState(cfg: PortalsYamlConfig | null | undefined): {
  rows: CompanyFormRow[];
  titlePreset: TitlePreset;
  positiveLines: string;
  negativePresetKeys: Set<string>;
  negativeExtraLines: string;
} {
  if (!cfg || typeof cfg !== "object") {
    return {
      rows: [],
      titlePreset: "any",
      positiveLines: "",
      negativePresetKeys: new Set(),
      negativeExtraLines: "",
    };
  }
  const companies = cfg.tracked_companies ?? [];
  const rows = companies.map((c) => inferRowFromCompany(c));
  const pos = (cfg.title_filter?.positive ?? []).map(String);
  const neg = (cfg.title_filter?.negative ?? []).map(String);
  const negativePresetKeys = new Set<string>();
  const negativeExtras: string[] = [];
  for (const n of neg) {
    const hit = NEGATIVE_PRESETS.find((p) => p.key === n);
    if (hit) negativePresetKeys.add(hit.key);
    else negativeExtras.push(n);
  }
  const titlePreset = detectPresetFromPositives(pos);
  const positiveLines = pos.join("\n");
  return {
    rows,
    titlePreset,
    positiveLines,
    negativePresetKeys,
    negativeExtraLines: negativeExtras.join("\n"),
  };
}

function parseSeed(portalsSeed: string) {
  try {
    const cfg =
      portalsSeed && portalsSeed !== "null"
        ? (JSON.parse(portalsSeed) as PortalsYamlConfig)
        : null;
    return parsePortalsToFormState(cfg);
  } catch {
    return parsePortalsToFormState(null);
  }
}

function buildConfigFromState(args: {
  rows: CompanyFormRow[];
  positiveLines: string;
  negativePresetKeys: Set<string>;
  negativeExtraLines: string;
}): PortalsYamlConfig | null {
  const tracked_companies = rowsToTrackedCompanies(args.rows);
  if (tracked_companies.length === 0) return null;

  const positive = parsePositiveLines(args.positiveLines);
  const extras = parsePositiveLines(args.negativeExtraLines);
  const fromPresets = NEGATIVE_PRESETS.filter((p) =>
    args.negativePresetKeys.has(p.key),
  ).map((p) => p.key);
  const negative = [...new Set([...fromPresets, ...extras])];

  const title_filter =
    positive.length || negative.length
      ? {
          ...(positive.length ? { positive } : {}),
          ...(negative.length ? { negative } : {}),
        }
      : undefined;

  return {
    tracked_companies,
    ...(title_filter && Object.keys(title_filter).length
      ? { title_filter }
      : {}),
  };
}

export type AtsBoardsEditorHandle = {
  /** Valid portals config, or null if nothing to save / no complete company rows */
  getConfig: () => PortalsYamlConfig | null;
  /** True if any row is partially filled (needs completion or removal before save) */
  hasIncompleteCompanyRows: () => boolean;
};

export type AtsBoardsEditorProps = {
  /** When this string changes (e.g. after save + router.refresh), the form resets from server */
  portalsSeed: string;
};

export const AtsBoardsEditor = React.forwardRef<AtsBoardsEditorHandle, AtsBoardsEditorProps>(
  function AtsBoardsEditor({ portalsSeed }, ref) {
    const [rows, setRows] = React.useState<CompanyFormRow[]>(() => parseSeed(portalsSeed).rows);
    const [titlePreset, setTitlePreset] = React.useState<TitlePreset>(
      () => parseSeed(portalsSeed).titlePreset,
    );
    const [positiveLines, setPositiveLines] = React.useState(
      () => parseSeed(portalsSeed).positiveLines,
    );
    const [negativePresetKeys, setNegativePresetKeys] = React.useState<Set<string>>(
      () => new Set(parseSeed(portalsSeed).negativePresetKeys),
    );
    const [negativeExtraLines, setNegativeExtraLines] = React.useState(
      () => parseSeed(portalsSeed).negativeExtraLines,
    );

    const lastSeedRef = React.useRef(portalsSeed);
    React.useEffect(() => {
      if (portalsSeed === lastSeedRef.current) return;
      lastSeedRef.current = portalsSeed;
      const next = parseSeed(portalsSeed);
      setRows(next.rows);
      setTitlePreset(next.titlePreset);
      setPositiveLines(next.positiveLines);
      setNegativePresetKeys(new Set(next.negativePresetKeys));
      setNegativeExtraLines(next.negativeExtraLines);
    }, [portalsSeed]);

    React.useImperativeHandle(
      ref,
      () => ({
        getConfig: () =>
          buildConfigFromState({
            rows,
            positiveLines,
            negativePresetKeys,
            negativeExtraLines,
          }),
        hasIncompleteCompanyRows: () =>
          rows.some((r) => {
            const hasName = Boolean(r.name.trim());
            const hasBoard = Boolean(buildCareersUrl(r));
            return (hasName && !hasBoard) || (!hasName && hasBoard);
          }),
      }),
      [rows, positiveLines, negativePresetKeys, negativeExtraLines],
    );

    const toggleNegative = (key: string) => {
      setNegativePresetKeys((prev) => {
        const n = new Set(prev);
        if (n.has(key)) n.delete(key);
        else n.add(key);
        return n;
      });
    };

    const addRow = () => {
      setRows((prev) => [
        ...prev,
        {
          id: newRowId(),
          name: "",
          platform: "ashby",
          slugOrUrl: "",
          enabled: true,
        },
      ]);
    };

    const updateRow = (id: string, patch: Partial<CompanyFormRow>) => {
      setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    };

    const removeRow = (id: string) => {
      setRows((prev) => prev.filter((r) => r.id !== id));
    };

    const handleTitlePreset = (preset: TitlePreset) => {
      setTitlePreset(preset);
      if (preset === "any") setPositiveLines("");
      else if (preset !== "custom") setPositiveLines(positiveLinesFromPreset(preset));
    };

    const previewJson = React.useMemo(() => {
      const cfg = buildConfigFromState({
        rows,
        positiveLines,
        negativePresetKeys,
        negativeExtraLines,
      });
      return cfg ? JSON.stringify(cfg, null, 2) : "";
    }, [rows, positiveLines, negativePresetKeys, negativeExtraLines]);

    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-base font-medium">Companies to scan</Label>
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="size-4" />
              Add company
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Choose the ATS, then enter the board slug from the public jobs URL (or pick Custom and
            paste the full careers URL).
          </p>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground border rounded-md px-4 py-6 text-center">
              No companies yet. Click <strong>Add company</strong> to build your list.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {rows.map((row, idx) => (
                <div
                  key={row.id}
                  className="rounded-lg border bg-muted/20 p-4 flex flex-col gap-3 sm:grid sm:grid-cols-12 sm:gap-3 sm:items-end"
                >
                  <div className="sm:col-span-3 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Company name</Label>
                    <Input
                      value={row.name}
                      onChange={(e) => updateRow(row.id, { name: e.target.value })}
                      placeholder={`Company ${idx + 1}`}
                    />
                  </div>
                  <div className="sm:col-span-3 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">ATS</Label>
                    <Select
                      value={row.platform}
                      onValueChange={(v) =>
                        updateRow(row.id, { platform: v as AtsPlatform })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ashby">Ashby</SelectItem>
                        <SelectItem value="greenhouse">Greenhouse</SelectItem>
                        <SelectItem value="lever">Lever</SelectItem>
                        <SelectItem value="custom">Custom URL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-5 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {row.platform === "custom"
                        ? "Careers page URL"
                        : "Board slug (from jobs URL)"}
                    </Label>
                    <Input
                      value={row.slugOrUrl}
                      onChange={(e) => updateRow(row.id, { slugOrUrl: e.target.value })}
                      placeholder={
                        row.platform === "ashby"
                          ? "acme"
                          : row.platform === "greenhouse"
                            ? "acme"
                            : row.platform === "lever"
                              ? "acme"
                              : "https://…"
                      }
                    />
                  </div>
                  <div className="sm:col-span-1 flex gap-2 justify-end pb-1">
                    <label className="flex items-center gap-1.5 text-xs whitespace-nowrap cursor-pointer">
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={(e) =>
                          updateRow(row.id, { enabled: e.target.checked })
                        }
                        className="rounded border-input"
                      />
                      On
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive shrink-0"
                      onClick={() => removeRow(row.id)}
                      aria-label="Remove company"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Label className="text-base font-medium">Job title focus</Label>
          <p className="text-sm text-muted-foreground">
            Only roles whose titles match these rules are kept. Presets fill a starter list; switch
            to Custom to edit freely (one phrase per line — any line can match).
          </p>
          <Select
            value={titlePreset}
            onValueChange={(v) => handleTitlePreset(v as TitlePreset)}
          >
            <SelectTrigger className="w-full max-w-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TITLE_PRESET_LABEL) as TitlePreset[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {TITLE_PRESET_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="space-y-1.5">
            <Label htmlFor="positive-keywords" className="text-xs text-muted-foreground">
              Include titles containing (one phrase per line)
            </Label>
            <Textarea
              id="positive-keywords"
              value={positiveLines}
              onChange={(e) => {
                setPositiveLines(e.target.value);
                setTitlePreset("custom");
              }}
              disabled={titlePreset === "any"}
              rows={5}
              className="font-mono text-xs"
              placeholder="e.g. Engineer&#10;Machine Learning"
            />
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-base font-medium">Exclude from titles</Label>
          <p className="text-sm text-muted-foreground">
            If a title contains any of these, the posting is skipped.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {NEGATIVE_PRESETS.map((p) => (
              <label
                key={p.key}
                className="flex items-center gap-2 text-sm cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={negativePresetKeys.has(p.key)}
                  onChange={() => toggleNegative(p.key)}
                  className="rounded border-input"
                />
                {p.label}
              </label>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="negative-extra" className="text-xs text-muted-foreground">
              Extra exclude phrases (one per line)
            </Label>
            <Textarea
              id="negative-extra"
              value={negativeExtraLines}
              onChange={(e) => setNegativeExtraLines(e.target.value)}
              rows={3}
              className="font-mono text-xs"
              placeholder="e.g. WordPress"
            />
          </div>
        </div>

        <details className="rounded-lg border bg-muted/10 text-sm">
          <summary className="cursor-pointer px-4 py-3 font-medium">
            Advanced: generated JSON (read-only)
          </summary>
          <pre className="px-4 pb-4 text-xs overflow-auto max-h-56 whitespace-pre-wrap font-mono text-muted-foreground border-t">
            {previewJson || "(add at least one company with name and board to preview)"}
          </pre>
        </details>
      </div>
    );
  },
);

AtsBoardsEditor.displayName = "AtsBoardsEditor";
