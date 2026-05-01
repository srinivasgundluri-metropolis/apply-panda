"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { detectPortalApi, parseWorkdayCareersUrl } from "@/lib/portal-scan";
import type { PortalsTrackedCompany, PortalsYamlConfig } from "@/lib/types";

export type AtsPlatform = "ashby" | "greenhouse" | "lever" | "workday" | "custom";

export type CompanyFormRow = {
  id: string;
  name: string;
  platform: AtsPlatform;
  /** Board slug, or full careers URL when platform is custom */
  slugOrUrl: string;
  enabled: boolean;
};

/** How the user prefers to capture board URLs (both resolve to tracked_companies JSON). */
export type BoardEntryMode = "tables" | "bulk";

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

const ATS_CURATION_STORAGE_KEY = "apply-panda:ats-boards-targeting-reminders:v1";

type StoredCuration = { pledgesEmployersCurated?: boolean; pledgesFiltersNonSpam?: boolean };

function readStoredCuration(): StoredCuration {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(
      window.localStorage.getItem(ATS_CURATION_STORAGE_KEY) ?? "{}",
    ) as StoredCuration;
  } catch {
    return {};
  }
}

function writeStoredCuration(p: StoredCuration) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ATS_CURATION_STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore quota */
  }
}

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

function titleCaseSlug(s: string): string {
  return s
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Label for CSV row / bulk paste (not stored in portals JSON besides company name field). */
export function guessCompanyLabelFromUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const wdGuess = parseWorkdayCareersUrl(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (wdGuess) return titleCaseSlug(wdGuess.tenant);
    const ashby = trimmed.match(/jobs\.ashbyhq\.com\/([^/?#]+)/i);
    if (ashby) return titleCaseSlug(ashby[1]);
    const lever = trimmed.match(/jobs\.lever\.co\/([^/?#]+)/i);
    if (lever) return titleCaseSlug(lever[1]);
    const gh = trimmed.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/i);
    if (gh) return titleCaseSlug(gh[1]);
    const hostname = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`)
      .hostname.replace(/^www\./, "")
      .split(".")[0];
    return hostname ? titleCaseSlug(hostname) : "Careers board";
  } catch {
    return "Careers board";
  }
}

export function inferRowFromCompany(c: PortalsTrackedCompany): CompanyFormRow {
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
  const wd = parseWorkdayCareersUrl(url);
  if (wd) {
    const canonical = `${wd.calypsoOrigin}/${wd.siteId}`;
    return {
      id: newRowId(),
      name,
      platform: "workday",
      slugOrUrl: canonical,
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
  if (row.platform === "custom" || row.platform === "workday") return raw;
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
  boardEntryMode: BoardEntryMode;
  bulkPaste: string;
  rows: CompanyFormRow[];
  titlePreset: TitlePreset;
  positiveLines: string;
  negativePresetKeys: Set<string>;
  negativeExtraLines: string;
  locationPreset: LocationPreset;
  locationPositiveLines: string;
  locationNegativeLines: string;
};

export function parsePortalsToFormState(cfg: PortalsYamlConfig | null | undefined): ParsedPortalsForm {
  const emptyNegative = (): ParsedPortalsForm => ({
    boardEntryMode: "tables",
    bulkPaste: "",
    rows: [],
    titlePreset: "any",
    positiveLines: "",
    negativePresetKeys: new Set(),
    negativeExtraLines: "",
    locationPreset: "any",
    locationPositiveLines: "",
    locationNegativeLines: "",
  });

  if (!cfg || typeof cfg !== "object") {
    return emptyNegative();
  }
  const companies = cfg.tracked_companies ?? [];
  const rows = companies.map((c) => inferRowFromCompany(c));
  const bulkPaste = rows
    .map((r) => buildCareersUrl(r))
    .filter(Boolean)
    .join("\n");

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
    boardEntryMode: "tables",
    bulkPaste,
    rows,
    titlePreset: detectTitlePreset(pos),
    positiveLines: pos.join("\n"),
    negativePresetKeys,
    negativeExtraLines: negativeExtras.join("\n"),
    locationPreset: detectLocationPreset(lPos),
    locationPositiveLines: lPos.join("\n"),
    locationNegativeLines: lNeg.join("\n"),
  };
}

function parseSeed(portalsSeed: string): ParsedPortalsForm {
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

function bulkPasteToRows(text: string): CompanyFormRow[] {
  const lines = text.split(/\n/).map((l) => l.trim());
  const out: CompanyFormRow[] = [];
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    let url = line;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (!detectPortalApi({ careers_url: url })) continue;
    const name = guessCompanyLabelFromUrl(url);
    out.push(inferRowFromCompany({ careers_url: url, name, enabled: true }));
  }
  return out;
}

function effectiveRows(
  mode: BoardEntryMode,
  bulkPaste: string,
  tableRows: CompanyFormRow[],
): CompanyFormRow[] {
  if (mode === "bulk") {
    return bulkPasteToRows(bulkPaste);
  }
  return tableRows;
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
  boardEntryMode: BoardEntryMode;
  bulkPaste: string;
  rows: CompanyFormRow[];
  positiveLines: string;
  negativePresetKeys: Set<string>;
  negativeExtraLines: string;
  locationPositiveLines: string;
  locationNegativeLines: string;
}): PortalsYamlConfig | null {
  const eff = effectiveRows(args.boardEntryMode, args.bulkPaste, args.rows);
  const tracked_companies = rowsToTrackedCompanies(eff);
  if (tracked_companies.length === 0) return null;

  const title_filter = mergeTitleFilter({
    positiveLines: args.positiveLines,
    negativePresetKeys: args.negativePresetKeys,
    negativeExtraLines: args.negativeExtraLines,
  });

  const location_filter = mergeLocationFilter({
    locationPositiveLines: args.locationPositiveLines,
    locationNegativeLines: args.locationNegativeLines,
  });

  const out: PortalsYamlConfig = { tracked_companies };
  if (title_filter) out.title_filter = title_filter;
  if (location_filter) out.location_filter = location_filter;
  return out;
}

function bulkPasteHasUnsupportedLines(text: string): boolean {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  for (const raw of lines) {
    let url = raw;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (!detectPortalApi({ careers_url: url })) return true;
  }
  return false;
}

export type AtsBoardsEditorHandle = {
  getConfig: () => PortalsYamlConfig | null;
  hasIncompleteCompanyRows: () => boolean;
};

export type AtsBoardsEditorProps = {
  portalsSeed: string;
};

export const AtsBoardsEditor = React.forwardRef<AtsBoardsEditorHandle, AtsBoardsEditorProps>(
  function AtsBoardsEditor({ portalsSeed }, ref) {
    const s0 = parseSeed(portalsSeed);
    const [boardEntryMode, setBoardEntryMode] = React.useState<BoardEntryMode>(
      s0.boardEntryMode,
    );
    const [bulkPaste, setBulkPaste] = React.useState(s0.bulkPaste);
    const [rows, setRows] = React.useState<CompanyFormRow[]>(() => s0.rows);
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

    const [pledges, setPledges] = React.useState<StoredCuration>({
      pledgesEmployersCurated: false,
      pledgesFiltersNonSpam: false,
    });

    React.useLayoutEffect(() => {
      setPledges((prev) => ({ ...prev, ...readStoredCuration() }));
    }, []);

    const setPledgeField = React.useCallback((key: keyof StoredCuration, value: boolean) => {
      setPledges((prev) => {
        const next = { ...prev, [key]: value };
        writeStoredCuration(next);
        return next;
      });
    }, []);

    const lastSeedRef = React.useRef(portalsSeed);
    React.useEffect(() => {
      if (portalsSeed === lastSeedRef.current) return;
      lastSeedRef.current = portalsSeed;
      const next = parseSeed(portalsSeed);
      setBoardEntryMode(next.boardEntryMode);
      setBulkPaste(next.bulkPaste);
      setRows(next.rows);
      setTitlePreset(next.titlePreset);
      setPositiveLines(next.positiveLines);
      setNegativePresetKeys(new Set(next.negativePresetKeys));
      setNegativeExtraLines(next.negativeExtraLines);
      setLocationPreset(next.locationPreset);
      setLocationPositiveLines(next.locationPositiveLines);
      setLocationNegativeLines(next.locationNegativeLines);
    }, [portalsSeed]);

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
            boardEntryMode,
            bulkPaste,
            rows,
            positiveLines,
            negativePresetKeys,
            negativeExtraLines,
            locationPositiveLines,
            locationNegativeLines,
          }),
        hasIncompleteCompanyRows: () => {
          const eff = effectiveRows(boardEntryMode, bulkPaste, rows);
          if (boardEntryMode === "bulk") {
            const nonempty = bulkPaste
              .split(/\n/)
              .map((l) => l.trim())
              .filter((l) => l.length && !l.startsWith("#"));
            if (nonempty.some((line) => {
              let u = line;
              if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
              return !detectPortalApi({ careers_url: u });
            }))
              return true;
          }
          return eff.some((r) => {
            const hasName = Boolean(r.name.trim());
            const hasBoard = Boolean(buildCareersUrl(r));
            return (hasName && !hasBoard) || (!hasName && hasBoard);
          });
        },
      }),
      [
        boardEntryMode,
        bulkPaste,
        rows,
        positiveLines,
        negativePresetKeys,
        negativeExtraLines,
        locationPositiveLines,
        locationNegativeLines,
      ],
    );

    const previewJson = React.useMemo(() => {
      const cfg = buildConfigFromState({
        boardEntryMode,
        bulkPaste,
        rows,
        positiveLines,
        negativePresetKeys,
        negativeExtraLines,
        locationPositiveLines,
        locationNegativeLines,
      });
      return cfg ? JSON.stringify(cfg, null, 2) : "";
    }, [
      boardEntryMode,
      bulkPaste,
      rows,
      positiveLines,
      negativePresetKeys,
      negativeExtraLines,
      locationPositiveLines,
      locationNegativeLines,
    ]);

    return (
      <div className="flex flex-col gap-8">
        <div className="rounded-md border bg-muted/30 px-4 py-3 space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            <strong className="text-foreground">Curate employers first.</strong> Add career boards only
            for companies you&apos;d realistically engage with—fit, legitimacy, commute or remote stance,
            and stage matter beyond the job title alone. Matching your title plus location keywords is{" "}
            <strong className="text-foreground">necessary, not sufficient</strong> when deciding who
            deserves your time.
          </p>
          <p>
            <strong className="text-foreground">How scanning works:</strong> We fetch supported ATS
            postings for employers you configure in Step 1. Step 2 and 4 narrow hits on our side
            using substring filters; chat can tighten further later. No “every company globally” endpoint
            exists.
          </p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              Employers / <strong className="text-foreground">job-board URLs</strong>
            </li>
            <li>
              Included <strong className="text-foreground">titles</strong> (OR semantics)
            </li>
            <li>
              Optional title <strong className="text-foreground">excludes</strong>
            </li>
            <li>
              Optional <strong className="text-foreground">location</strong> lines
            </li>
          </ol>
          <div className="rounded-md border border-dashed bg-background/60 px-3 py-2 text-xs">
            <div className="font-medium text-foreground">Targeting checklist — saved in this browser</div>
            <div className="mt-2 space-y-2">
              <label className="flex cursor-pointer gap-2 items-start">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-input"
                  checked={Boolean(pledges.pledgesEmployersCurated)}
                  onChange={(e) => setPledgeField("pledgesEmployersCurated", e.target.checked)}
                />
                <span>My boards list is deliberate—not every employer with any supported ATS URL.</span>
              </label>
              <label className="flex cursor-pointer gap-2 items-start">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-input"
                  checked={Boolean(pledges.pledgesFiltersNonSpam)}
                  onChange={(e) => setPledgeField("pledgesFiltersNonSpam", e.target.checked)}
                />
                <span>
                  Titles and locations sharpen this list—they are not a blank check to blanket-apply or
                  spray low-context applications.
                </span>
              </label>
            </div>
          </div>
        </div>

        <section className="rounded-lg border border-border bg-muted/10 p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2 gap-y-1">
            <Badge variant="secondary">Step 1</Badge>
            <Label className="text-base font-medium">Employers — job boards</Label>
          </div>
          <p className="text-sm text-muted-foreground">
            Pick only boards you intend to monitor. Larger boards amplify noise—you still filter by titles
            and locations below.
          </p>
          <Select
            value={boardEntryMode}
            onValueChange={(v) => {
              const next = v as BoardEntryMode;
              if (next === "bulk") {
                const joined = rows
                  .map((r) => buildCareersUrl(r))
                  .filter(Boolean)
                  .join("\n");
                setBulkPaste((prev) => (prev.trim() ? prev : joined));
              } else {
                const fromBulk = bulkPasteToRows(bulkPaste).map((br) =>
                  inferRowFromCompany({
                    careers_url: buildCareersUrl(br),
                    name: guessCompanyLabelFromUrl(buildCareersUrl(br)),
                    enabled: br.enabled,
                  }),
                );
                if (rows.length === 0 && fromBulk.length) setRows(fromBulk);
              }
              setBoardEntryMode(next);
            }}
          >
            <SelectTrigger className="w-full max-w-lg">
              <SelectValue placeholder="Pick how you enter boards" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tables">Add boards one-by-one</SelectItem>
              <SelectItem value="bulk">Paste many board URLs</SelectItem>
            </SelectContent>
          </Select>

          {boardEntryMode === "bulk" ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                One careers URL per line (Ashby, Greenhouse job-board hosts, Lever, or{" "}
                <code className="text-xs">tenant.wd5.myworkdayjobs.com/your-careers-site-id</code>
                ). Lines starting with <code className="text-xs">#</code> are comments. Bare slugs
                alone are skipped — paste full URLs only.
              </p>
              {bulkPasteHasUnsupportedLines(bulkPaste) ? (
                <p className="text-xs text-destructive">
                  Some lines cannot be mapped to supported ATS URLs — fix links or switch to one-by-one
                  entry.
                </p>
              ) : null}
              <Textarea
                value={bulkPaste}
                onChange={(e) => setBulkPaste(e.target.value)}
                spellCheck={false}
                className="min-h-[240px] font-mono text-xs leading-relaxed"
                placeholder={`# Examples\nhttps://jobs.ashbyhq.com/example\nhttps://job-boards.greenhouse.io/example\nhttps://jobs.lever.co/example\nhttps://acme.wd1.myworkdayjobs.com/acme-careers`}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setBulkPaste(rows.map((r) => buildCareersUrl(r)).filter(Boolean).join("\n"))
                }
              >
                Copy current boards from rows into textarea
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  Company label, ATS, and slug or full careers URL per row.
                </p>
                <Button type="button" variant="outline" size="sm" onClick={addRow}>
                  <Plus className="size-4" />
                  Add row
                </Button>
              </div>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground border rounded-md px-4 py-6 text-center">
                  No boards yet. Add rows or switch to paste-many-URLs mode.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {rows.map((row, idx) => (
                    <div
                      key={row.id}
                      className="rounded-lg border bg-muted/30 p-4 flex flex-col gap-3 sm:grid sm:grid-cols-12 sm:gap-3 sm:items-end"
                    >
                      <div className="sm:col-span-3 space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          Display name / company
                        </Label>
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
                            <SelectItem value="workday">Workday</SelectItem>
                            <SelectItem value="custom">Other URL</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-5 space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          {row.platform === "custom" || row.platform === "workday"
                            ? "Careers URL"
                            : "Slug from jobs URL"}
                        </Label>
                        <Input
                          value={row.slugOrUrl}
                          onChange={(e) =>
                            updateRow(row.id, { slugOrUrl: e.target.value })
                          }
                          placeholder={
                            row.platform === "custom" || row.platform === "workday"
                              ? "https://tenant.wd3.myworkdayjobs.com/site-id…"
                              : "acme"
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
                          aria-label="Remove board"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <div className="space-y-3 border-t pt-8">
          <div className="flex flex-wrap items-center gap-2 gap-y-1">
            <Badge variant="outline">Step 2</Badge>
            <Label className="text-base font-medium">Roles — job titles to include</Label>
          </div>
          <p className="text-sm text-muted-foreground">
            Further narrows postings from employers in Step 1. Lines are combined with{" "}
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
            <Badge variant="outline">Step 3</Badge>
            <Label className="text-base font-medium">Roles — exclude from titles</Label>
          </div>
          <p className="text-sm text-muted-foreground">
            If the title contains any of these fragments, drop the posting (still scoped to employers in
            Step 1).
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

        <div className="space-y-3 border-t pt-8">
          <div className="flex flex-wrap items-center gap-2 gap-y-1">
            <Badge variant="outline">Step 4</Badge>
            <Label className="text-base font-medium">Locations</Label>
          </div>
          <p className="text-sm text-muted-foreground">
            Optional. Applies on top of whatever passes Steps 2–3. Matched against the ATS &quot;location&quot;
            text for each posting (substring, case-insensitive). Presets are hints—not zip-code geocoding.
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

        <details className="rounded-lg border bg-muted/10 text-sm">
          <summary className="cursor-pointer px-4 py-3 font-medium">
            Advanced: generated JSON (read-only)
          </summary>
          <pre className="px-4 pb-4 text-xs overflow-auto max-h-56 whitespace-pre-wrap font-mono text-muted-foreground border-t">
            {previewJson || "(add boards + filters to preview)"}
          </pre>
        </details>
      </div>
    );
  },
);

AtsBoardsEditor.displayName = "AtsBoardsEditor";
