"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
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
import { DEFAULT_PORTAL_CATALOG_SIZE } from "@/lib/default-portal-catalog";
import { HOSTED_SCAN_MATCH_LIMIT } from "@/lib/portal-scan";
import type { PortalsYamlConfig } from "@/lib/types";

type TitlePreset = "any" | "engineering" | "ml_ai" | "product" | "usa_wide" | "custom";

const TITLE_PRESET_LABEL: Record<TitlePreset, string> = {
  any: "Any job title (no keyword filter)",
  engineering: "Engineering & platform",
  ml_ai: "ML & AI",
  product: "Product & program",
  usa_wide:
    "US careers — wide keyword net (common US title phrases, OR across lines)",
  custom: "Custom (edit list below)",
};

/**
 * Curated substrings seen in US job postings (knowledge work + tech-heavy).
 * Filter logic: title matches if it includes **any** line (OR). Not an exhaustive SOC/ONET list.
 */
const USA_WIDE_TITLE_KEYWORDS: string[] = [
  // Software & platform
  "Software Engineer",
  "Software Developer",
  "Application Engineer",
  "Full Stack",
  "Front End",
  "Frontend",
  "Back End",
  "Backend",
  "Web Developer",
  "Mobile Engineer",
  "Staff Engineer",
  "Principal Engineer",
  "Distinguished Engineer",
  "Engineering Manager",
  "Director of Engineering",
  "VP of Engineering",
  "Head of Engineering",
  "CTO",
  "Platform Engineer",
  "Infrastructure Engineer",
  "Site Reliability",
  "SRE",
  "DevOps",
  "Build Engineer",
  "Release Engineer",
  "Cloud Engineer",
  "Solutions Architect",
  "Cloud Architect",
  "Enterprise Architect",
  "Security Engineer",
  "Cybersecurity",
  "Information Security",
  "Network Engineer",
  "Systems Engineer",
  "Systems Administrator",
  "Database Administrator",
  "Site Administrator",
  "QA Engineer",
  "Quality Engineer",
  "Test Engineer",
  "SDET",
  "Automation Engineer",
  "Firmware Engineer",
  "Embedded Engineer",
  "Hardware Engineer",
  "Electrical Engineer",
  "Mechanical Engineer",
  "Manufacturing Engineer",
  "Validation Engineer",
  "Field Engineer",
  "Support Engineer",
  "Sales Engineer",
  "Forward Deployed",
  // Data & ML
  "Data Engineer",
  "Data Scientist",
  "Machine Learning",
  "MLOps",
  "AI Engineer",
  "Applied Scientist",
  "Research Scientist",
  "Deep Learning",
  "Computer Vision",
  "NLP",
  "Natural Language",
  "Generative AI",
  "LLM",
  "Data Analyst",
  "Business Intelligence",
  "Analytics Engineer",
  "Quantitative",
  "Statistician",
  // Product, program, project
  "Product Manager",
  "Group Product Manager",
  "Senior Product Manager",
  "Product Owner",
  "Technical Program",
  "Program Manager",
  "Project Manager",
  "TPM",
  "Product Designer",
  "Product Marketing",
  // Design & content
  "UX Designer",
  "UI Designer",
  "User Experience",
  "User Interface",
  "Graphic Designer",
  "Visual Designer",
  "Content Designer",
  "Technical Writer",
  "Copywriter",
  "Editor",
  // IT & business systems
  "Business Analyst",
  "Systems Analyst",
  "IT Manager",
  "Service Desk",
  "Help Desk",
  "Desktop Support",
  "SAP",
  "Salesforce",
  "Workday",
  // Go-to-market
  "Account Executive",
  "Account Manager",
  "Business Development",
  "Sales Manager",
  "Regional Sales",
  "Customer Success",
  "Implementation Consultant",
  "Solutions Consultant",
  "Marketing Manager",
  "Digital Marketing",
  "Growth Marketing",
  "Brand Manager",
  "Communications Manager",
  "Social Media",
  "SEO",
  "Demand Generation",
  // Operations & strategy
  "Operations Manager",
  "Business Operations",
  "Chief of Staff",
  "Strategy Manager",
  "Management Consultant",
  "Supply Chain",
  "Logistics",
  "Procurement",
  "Program Director",
  "General Manager",
  // People & legal
  "Human Resources",
  "HR Business Partner",
  "People Operations",
  "Talent Acquisition",
  "Recruiter",
  "Compensation",
  "Benefits",
  "Attorney",
  "Counsel",
  "Paralegal",
  "Compliance Manager",
  "Risk Manager",
  // Finance & accounting
  "Financial Analyst",
  "Finance Manager",
  "Controller",
  "Accountant",
  "Staff Accountant",
  "Auditor",
  "Treasury",
  "FP&A",
  "Tax Manager",
  "Payroll",
  // Clinical & health (common US titles; not exhaustive)
  "Registered Nurse",
  "Nurse Practitioner",
  "Physician Assistant",
  "Physical Therapist",
  "Occupational Therapist",
  "Pharmacist",
  "Medical Technologist",
  "Clinical Research",
  "Healthcare Administrator",
  // Skilled trades & field (US postings)
  "Electrician",
  "Plumber",
  "HVAC",
  "Welder",
  "Technician",
  "Inspector",
  "Estimator",
  "Superintendent",
  "Project Superintendent",
];

const TITLE_PRESET_POSITIVE: Record<
  Exclude<TitlePreset, "any" | "custom">,
  string[]
> = {
  engineering: [
    "Engineer",
    "Software Engineer",
    "Software Developer",
    "Developer",
    "Backend",
    "Front End",
    "Frontend",
    "Full Stack",
    "Platform",
    "Infrastructure",
    "DevOps",
    "SRE",
    "Site Reliability",
    "Security Engineer",
    "Cloud Engineer",
    "Embedded",
    "Firmware",
    "Hardware Engineer",
    "QA Engineer",
    "Test Engineer",
    "SDET",
    "Database",
    "Data Engineer",
    "Mobile Engineer",
    "Python",
    "Java ",
    "Node",
    "React",
    "System Administrator",
    "Network Engineer",
    "Solutions Architect",
    "Enterprise Architect",
    "Release Engineer",
    "Build Engineer",
  ],
  ml_ai: [
    "Machine Learning",
    "ML Engineer",
    "AI Engineer",
    "Deep Learning",
    "LLM",
    "GenAI",
    "Generative",
    "MLOps",
    "Applied Scientist",
    "Research Scientist",
    "Computer Vision",
    "NLP",
    "Natural Language",
    "Reinforcement Learning",
    "Robotics",
    "Autonomy",
    "Data Scientist",
    "Analytics Engineer",
    "Statistician",
    "Quantitative Research",
    "Inference",
    "Modeling",
    "PyTorch",
    "TensorFlow",
  ],
  product: [
    "Product Manager",
    "Sr. Product Manager",
    "Senior Product Manager",
    "Group Product Manager",
    "Principal Product Manager",
    "Product Owner",
    "Program Manager",
    "Technical Program",
    "Technical Program Manager",
    "TPM",
    "Product Lead",
    "Associate Product Manager",
    "APM",
    "Chief Product Officer",
    "Director of Product",
    "VP of Product",
    "Head of Product",
    "Product Marketing",
    "Solutions Manager",
  ],
  usa_wide: USA_WIDE_TITLE_KEYWORDS,
};

type LocationPreset = "any" | "remote" | "us" | "europe_uk" | "canada" | "custom";

const LOCATION_PRESET_LABEL: Record<LocationPreset, string> = {
  any: "Anywhere (no location keyword filter)",
  remote: "Remote-friendly",
  us: "United States (substring hints)",
  europe_uk: "Europe & UK (substring hints)",
  canada: "Canada",
  custom: "Custom (edit lines below)",
};

const LOCATION_PRESET_POSITIVE: Record<
  Exclude<LocationPreset, "any" | "custom">,
  string[]
> = {
  remote: [
    "remote",
    "anywhere",
    "distributed",
    "work from home",
    "wfh",
    "fully remote",
    "100% remote",
    "globally remote",
  ],
  us: [
    "united states",
    "u.s.",
    " usa",
    ", ca",
    ", tx",
    ", ny",
    ", wa",
    ", co",
    ", il",
    ", ma",
    ", fl",
    ", ga",
    "california",
    "new york",
    "texas",
    "washington",
    "massachusetts",
  ],
  europe_uk: [
    "uk",
    "united kingdom",
    "london",
    "ireland",
    "dublin",
    "germany",
    "berlin",
    "munich",
    "france",
    "paris",
    "netherlands",
    "amsterdam",
    "spain",
    "barcelona",
    "italy",
    "milan",
    "switzerland",
    "zurich",
    "sweden",
    "stockholm",
    "poland",
    "lisbon",
  ],
  canada: ["canada", "toronto", "vancouver", "montreal", "ottawa", "calgary"],
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

function detectTitlePreset(lines: string[]): TitlePreset {
  const norm = (s: string) => s.trim().toLowerCase();
  const set = new Set(lines.map(norm).filter(Boolean));
  if (set.size === 0) return "any";
  for (const key of ["engineering", "ml_ai", "product", "usa_wide"] as const) {
    const preset = TITLE_PRESET_POSITIVE[key].map(norm);
    const minMatch = key === "usa_wide" ? Math.min(24, preset.length) : Math.min(3, preset.length);
    const maxExtra = key === "usa_wide" ? 80 : 2;
    const match = preset.filter((p) => set.has(p)).length;
    if (match >= minMatch && set.size <= preset.length + maxExtra) {
      return key;
    }
  }
  return "custom";
}

function locationLinesFromPreset(preset: LocationPreset): string {
  if (preset === "any" || preset === "custom") return "";
  return LOCATION_PRESET_POSITIVE[preset].join("\n");
}

function detectLocationPreset(lines: string[]): LocationPreset {
  const norm = (s: string) => s.trim().toLowerCase();
  const set = new Set(lines.map(norm).filter(Boolean));
  if (set.size === 0) return "any";
  for (const key of ["remote", "us", "europe_uk", "canada"] as const) {
    const preset = LOCATION_PRESET_POSITIVE[key].map(norm);
    const match = preset.filter((p) => set.has(p)).length;
    if (match >= Math.min(4, preset.length) && set.size <= preset.length + 3) {
      return key === "remote" ? "remote" : key === "us" ? "us" : key === "canada" ? "canada" : "europe_uk";
    }
  }
  return "custom";
}

export type ParsedPortalsForm = {
  companyFilter: string;
  titlePreset: TitlePreset;
  positiveLines: string;
  negativePresetKeys: Set<string>;
  negativeExtraLines: string;
  locationPreset: LocationPreset;
  locationPositiveLines: string;
  locationNegativeLines: string;
};

function uniqueNonEmpty(lines: string[]): string[] {
  return [...new Set(lines.map((x) => x.trim()).filter(Boolean))];
}

export function parsePortalsToFormState(
  cfg: PortalsYamlConfig | null | undefined,
  fallbackTitleLines: string[] = [],
): ParsedPortalsForm {
  const fallback = uniqueNonEmpty(fallbackTitleLines);
  const emptyNegative = (): ParsedPortalsForm => ({
    companyFilter: "",
    titlePreset: fallback.length ? "custom" : "any",
    positiveLines: fallback.join("\n"),
    negativePresetKeys: new Set(),
    negativeExtraLines: "",
    locationPreset: "any",
    locationPositiveLines: "",
    locationNegativeLines: "",
  });

  if (!cfg || typeof cfg !== "object") {
    return emptyNegative();
  }
  const pos = (cfg.title_filter?.positive ?? []).map(String);
  const neg = (cfg.title_filter?.negative ?? []).map(String);
  const negativePresetKeys = new Set<string>();
  const negativeExtras: string[] = [];
  for (const n of neg) {
    const hit = NEGATIVE_PRESETS.find((p) => p.key === n);
    if (hit) negativePresetKeys.add(hit.key);
    else negativeExtras.push(n);
  }

  const lPos = (cfg.location_filter?.positive ?? []).map(String);
  const lNeg = (cfg.location_filter?.negative ?? []).map(String);

  return {
    companyFilter:
      typeof cfg.company_filter === "string" ? cfg.company_filter : "",
    titlePreset: detectTitlePreset(pos),
    positiveLines: pos.join("\n"),
    negativePresetKeys,
    negativeExtraLines: negativeExtras.join("\n"),
    locationPreset: detectLocationPreset(lPos),
    locationPositiveLines: lPos.join("\n"),
    locationNegativeLines: lNeg.join("\n"),
  };
}

function parseSeed(portalsSeed: string, fallbackTitleLines: string[]): ParsedPortalsForm {
  try {
    const cfg =
      portalsSeed && portalsSeed !== "null"
        ? (JSON.parse(portalsSeed) as PortalsYamlConfig)
        : null;
    return parsePortalsToFormState(cfg, fallbackTitleLines);
  } catch {
    return parsePortalsToFormState(null, fallbackTitleLines);
  }
}

function mergeTitleFilter(opts: {
  positiveLines: string;
  negativePresetKeys: Set<string>;
  negativeExtraLines: string;
}): PortalsYamlConfig["title_filter"] | undefined {
  const positive = parsePositiveLines(opts.positiveLines);
  const extras = parsePositiveLines(opts.negativeExtraLines);
  const fromPresets = NEGATIVE_PRESETS.filter((p) =>
    opts.negativePresetKeys.has(p.key),
  ).map((p) => p.key);
  const negative = [...new Set([...fromPresets, ...extras])];

  const title_filter =
    positive.length || negative.length
      ? {
          ...(positive.length ? { positive } : {}),
          ...(negative.length ? { negative } : {}),
        }
      : undefined;

  return title_filter && Object.keys(title_filter).length ? title_filter : undefined;
}

function mergeLocationFilter(opts: {
  locationPositiveLines: string;
  locationNegativeLines: string;
}): PortalsYamlConfig["location_filter"] | undefined {
  const positive = parsePositiveLines(opts.locationPositiveLines);
  const negative = parsePositiveLines(opts.locationNegativeLines);
  const location_filter =
    positive.length || negative.length
      ? {
          ...(positive.length ? { positive } : {}),
          ...(negative.length ? { negative } : {}),
        }
      : undefined;
  return location_filter && Object.keys(location_filter).length ? location_filter : undefined;
}

function buildConfigFromState(args: {
  companyFilter: string;
  positiveLines: string;
  negativePresetKeys: Set<string>;
  negativeExtraLines: string;
  locationPositiveLines: string;
  locationNegativeLines: string;
}): PortalsYamlConfig | null {
  const tracked_companies: PortalsYamlConfig["tracked_companies"] = [];

  const title_filter = mergeTitleFilter({
    positiveLines: args.positiveLines,
    negativePresetKeys: args.negativePresetKeys,
    negativeExtraLines: args.negativeExtraLines,
  });

  const location_filter = mergeLocationFilter({
    locationPositiveLines: args.locationPositiveLines,
    locationNegativeLines: args.locationNegativeLines,
  });

  const tp = title_filter?.positive?.length ?? 0;
  const lp = location_filter?.positive?.length ?? 0;
  if (tp === 0 && lp === 0) return null;

  const out: PortalsYamlConfig = { tracked_companies };
  const cf = args.companyFilter.trim().slice(0, 200);
  /** Persist empty string so profile merge clears a previous filter (see `deepMerge` in profile.ts). */
  out.company_filter = cf;
  if (title_filter) out.title_filter = title_filter;
  if (location_filter) out.location_filter = location_filter;
  return out;
}

export type AtsBoardsEditorHandle = {
  getConfig: () => PortalsYamlConfig | null;
  hasIncompleteCompanyRows: () => boolean;
};

export type AtsBoardsEditorProps = {
  portalsSeed: string;
  fallbackTitleLines?: string[];
};

export const AtsBoardsEditor = React.forwardRef<AtsBoardsEditorHandle, AtsBoardsEditorProps>(
  function AtsBoardsEditor({ portalsSeed, fallbackTitleLines = [] }, ref) {
    const s0 = parseSeed(portalsSeed, fallbackTitleLines);
    const [companyFilter, setCompanyFilter] = React.useState(s0.companyFilter);
    const [titlePreset, setTitlePreset] = React.useState<TitlePreset>(s0.titlePreset);
    const [positiveLines, setPositiveLines] = React.useState(s0.positiveLines);
    const [negativePresetKeys, setNegativePresetKeys] = React.useState<Set<string>>(
      () => new Set(s0.negativePresetKeys),
    );
    const [negativeExtraLines, setNegativeExtraLines] = React.useState(s0.negativeExtraLines);

    const [locationPreset, setLocationPreset] = React.useState<LocationPreset>(
      s0.locationPreset,
    );
    const [locationPositiveLines, setLocationPositiveLines] = React.useState(
      s0.locationPositiveLines,
    );
    const [locationNegativeLines, setLocationNegativeLines] = React.useState(
      s0.locationNegativeLines,
    );

    const fallbackSeed = React.useMemo(
      () => uniqueNonEmpty(fallbackTitleLines).join("\n"),
      [fallbackTitleLines],
    );
    const lastSeedRef = React.useRef(`${portalsSeed}::${fallbackSeed}`);
    React.useEffect(() => {
      const combined = `${portalsSeed}::${fallbackSeed}`;
      if (combined === lastSeedRef.current) return;
      lastSeedRef.current = combined;
      const next = parseSeed(portalsSeed, fallbackTitleLines);
      setCompanyFilter(next.companyFilter);
      setTitlePreset(next.titlePreset);
      setPositiveLines(next.positiveLines);
      setNegativePresetKeys(new Set(next.negativePresetKeys));
      setNegativeExtraLines(next.negativeExtraLines);
      setLocationPreset(next.locationPreset);
      setLocationPositiveLines(next.locationPositiveLines);
      setLocationNegativeLines(next.locationNegativeLines);
    }, [portalsSeed, fallbackSeed, fallbackTitleLines]);

    const toggleNegative = (key: string) => {
      setNegativePresetKeys((prev) => {
        const n = new Set(prev);
        if (n.has(key)) n.delete(key);
        else n.add(key);
        return n;
      });
    };

    const handleTitlePreset = (preset: TitlePreset) => {
      setTitlePreset(preset);
      if (preset === "any") setPositiveLines("");
      else if (preset !== "custom") setPositiveLines(positiveLinesFromPreset(preset));
    };

    const handleLocationPreset = (preset: LocationPreset) => {
      setLocationPreset(preset);
      if (preset === "any") setLocationPositiveLines("");
      else if (preset !== "custom") setLocationPositiveLines(locationLinesFromPreset(preset));
    };

    React.useImperativeHandle(
      ref,
      () => ({
        getConfig: () =>
          buildConfigFromState({
            companyFilter,
            positiveLines,
            negativePresetKeys,
            negativeExtraLines,
            locationPositiveLines,
            locationNegativeLines,
          }),
        hasIncompleteCompanyRows: () => false,
      }),
      [
        companyFilter,
        positiveLines,
        negativePresetKeys,
        negativeExtraLines,
        locationPositiveLines,
        locationNegativeLines,
      ],
    );

    const previewJson = React.useMemo(() => {
      const cfg = buildConfigFromState({
        companyFilter,
        positiveLines,
        negativePresetKeys,
        negativeExtraLines,
        locationPositiveLines,
        locationNegativeLines,
      });
      return cfg ? JSON.stringify(cfg, null, 2) : "";
    }, [
      companyFilter,
      positiveLines,
      negativePresetKeys,
      negativeExtraLines,
      locationPositiveLines,
      locationNegativeLines,
    ]);

    return (
      <div className="flex flex-col gap-8">
        <div className="rounded-md border bg-muted/30 px-4 py-3 space-y-2 text-sm text-muted-foreground leading-relaxed">
          <p>
            <strong className="text-foreground">Quick setup:</strong> add role titles (Step 1), optionally add
            locations (Step 2), then run scan. We save up to{" "}
            <strong className="text-foreground">{HOSTED_SCAN_MATCH_LIMIT}</strong> newest matches.
          </p>
          <p>
            Scan uses our curated ATS directory (~{DEFAULT_PORTAL_CATALOG_SIZE} boards). For additional
            discovery, use LinkedIn-first search in chat.
          </p>
        </div>

        <div className="space-y-3 border-t pt-8">
          <Label htmlFor="company-filter" className="text-base font-medium">
            Optional employer filter
          </Label>
          <p className="text-sm text-muted-foreground">
            Empty = no employer-name substring filter. This narrows matches within the ATS directory
            (~{DEFAULT_PORTAL_CATALOG_SIZE} boards).
          </p>
          <Input
            id="company-filter"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            placeholder="e.g. Stripe — leave blank for all employers"
            className="max-w-xl"
          />
        </div>

        <div className="space-y-3 border-t pt-8">
          <div className="flex flex-wrap items-center gap-2 gap-y-1">
            <Badge variant="outline">Step 1</Badge>
            <Label className="text-base font-medium">Roles — job titles to include</Label>
          </div>
          <p className="text-sm text-muted-foreground">
            Primary gate for scans. Lines are combined with{" "}
            <strong className="text-foreground">OR</strong>: the title needs at least one include match.
            Presets bundle common phrases—not every occupational title in existence.
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
              Include titles containing (one phrase per line — OR across lines)
            </Label>
            <Textarea
              id="positive-keywords"
              value={positiveLines}
              onChange={(e) => {
                setPositiveLines(e.target.value);
                setTitlePreset("custom");
              }}
              disabled={titlePreset === "any"}
              rows={titlePreset === "usa_wide" ? 16 : 6}
              className="font-mono text-xs min-h-[120px]"
              placeholder="e.g. Engineer&#10;Machine Learning"
            />
          </div>
        </div>

        <div className="space-y-3 border-t pt-8">
          <div className="flex flex-wrap items-center gap-2 gap-y-1">
            <Badge variant="outline">Step 2</Badge>
            <Label className="text-base font-medium">Locations</Label>
          </div>
          <p className="text-sm text-muted-foreground">
            Optional hints layered on titles. Matching uses the ATS &quot;location&quot; field (substring,
            case-insensitive). If you leave titles empty here, scan falls back to your profile target roles.
          </p>
          <Select
            value={locationPreset}
            onValueChange={(v) => handleLocationPreset(v as LocationPreset)}
          >
            <SelectTrigger className="w-full max-w-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(LOCATION_PRESET_LABEL) as LocationPreset[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {LOCATION_PRESET_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="space-y-1.5">
            <Label htmlFor="location-include" className="text-xs text-muted-foreground">
              Locations must contain (any line matches — OR logic)
            </Label>
            <Textarea
              id="location-include"
              value={locationPositiveLines}
              onChange={(e) => {
                setLocationPositiveLines(e.target.value);
                setLocationPreset("custom");
              }}
              disabled={locationPreset === "any"}
              rows={4}
              className="font-mono text-xs"
              placeholder={`e.g. Remote\nGermany`}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="location-exclude" className="text-xs text-muted-foreground">
              Locations containing these are excluded (one per line)
            </Label>
            <Textarea
              id="location-exclude"
              value={locationNegativeLines}
              onChange={(e) => setLocationNegativeLines(e.target.value)}
              rows={3}
              className="font-mono text-xs"
              placeholder="e.g. India&#10;Australia"
            />
          </div>
        </div>

        <div className="space-y-3 border-t pt-8">
          <div className="flex flex-wrap items-center gap-2 gap-y-1">
            <Badge variant="outline">Step 3</Badge>
            <Label className="text-base font-medium">Roles — exclude from titles</Label>
          </div>
          <p className="text-sm text-muted-foreground">
            Drop postings whose titles hit any fragment here. Applied after your include filters across the
            built-in ATS board list.
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
              Extra title excludes (one per line)
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
            {previewJson || "(add title and location lines to preview — `tracked_companies` stays empty)"}
          </pre>
        </details>
      </div>
    );
  },
);

AtsBoardsEditor.displayName = "AtsBoardsEditor";
