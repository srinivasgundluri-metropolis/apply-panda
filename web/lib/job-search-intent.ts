import type { LinkedInResult } from "@/lib/types";

export type ParsedJobSearchIntent = {
  query: string;
  wantsLinkedIn: boolean;
  wantsAtsBoards: boolean;
  timeRange: "24h" | "week" | "month" | "any";
  maxAgeHours?: number;
  companyNeedles: string[];
  domainNeedles: string[];
};

export function parseJobSearchIntent(text: string): ParsedJobSearchIntent {
  const raw = text.trim();
  const wantsLinkedIn = /\blinked[\s-]?in\b/i.test(raw);
  const wantsAtsBoards =
    /\b(stanford jobs|stanford careers|jobs site|career site|greenhouse|ashby|lever|workday|ats)\b/i.test(
      raw,
    );

  let timeRange: ParsedJobSearchIntent["timeRange"] = "any";
  let maxAgeHours: number | undefined;
  if (
    /\byesterday\b/i.test(raw) ||
    /\blast\s*24\s*(h|hr|hrs|hour|hours)\b/i.test(raw) ||
    /\bin\s*last\s*24\s*(h|hr|hrs|hour|hours)\b/i.test(raw)
  ) {
    timeRange = "24h";
    maxAgeHours = 24;
  } else if (
    /\b(last|past)\s*(7\s*(d|day|days)|week)\b/i.test(raw) ||
    /\bthis week\b/i.test(raw)
  ) {
    timeRange = "week";
    maxAgeHours = 24 * 7;
  } else if (/\b(last|past)\s*(30\s*(d|day|days)|month)\b/i.test(raw)) {
    timeRange = "month";
    maxAgeHours = 24 * 30;
  } else {
    const lastNDaysMatch = raw.match(
      /\b(?:last|past|in\s+the\s+last|in\s+last)\s+(\d+)\s*(?:day|days)\b/i,
    );
    if (lastNDaysMatch) {
      const d = Math.min(90, Math.max(1, parseInt(lastNDaysMatch[1], 10)));
      maxAgeHours = 24 * d;
      timeRange = d <= 1 ? "24h" : d <= 7 ? "week" : "month";
    }
  }

  const companyNeedles: string[] = [];
  if (/\bstanford\b/i.test(raw)) companyNeedles.push("stanford");

  const domainNeedles: string[] = [];
  if (
    /\blife[\s-]?sciences?\b/i.test(raw) ||
    /\bbiotech\b/i.test(raw) ||
    /\bbiolog(y|ical)\b/i.test(raw) ||
    /\bgenomics?\b/i.test(raw) ||
    /\bbiomedical\b/i.test(raw) ||
    /\bpharma\b/i.test(raw)
  ) {
    domainNeedles.push(
      "life science",
      "life sciences",
      "biotech",
      "biology",
      "biological",
      "genomics",
      "biomedical",
      "pharma",
    );
  }

  let query = raw
    .replace(/\bon\s+linkedin\b/gi, " ")
    .replace(/\bon\s+[^,.\n]*jobs?\s+site\b/gi, " ")
    .replace(
      /\b(last|past|in\s+the\s+last|in\s+last)\s*(\d+)\s*(?:day|days)\b/gi,
      " ",
    )
    .replace(/\b(last|past)\s*(24\s*(h|hr|hrs|hour|hours)|7\s*(d|day|days)|week|30\s*(d|day|days)|month)\b/gi, " ")
    .replace(/\byesterday\b/gi, " ")
    .replace(/\bthis week\b/gi, " ")
    .replace(/\bstanford\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!query) query = raw;

  return {
    query,
    wantsLinkedIn,
    wantsAtsBoards,
    timeRange,
    ...(maxAgeHours ? { maxAgeHours } : {}),
    companyNeedles,
    domainNeedles,
  };
}

export function applyPostFilters(
  jobs: LinkedInResult[],
  intent: ParsedJobSearchIntent,
): LinkedInResult[] {
  const now = Date.now();
  return jobs.filter((job) => {
    const hay = `${job.company} ${job.title} ${job.url}`.toLowerCase();
    if (
      intent.companyNeedles.length > 0 &&
      !intent.companyNeedles.some((needle) => hay.includes(needle))
    ) {
      return false;
    }
    if (
      intent.domainNeedles.length > 0 &&
      !intent.domainNeedles.some((needle) => hay.includes(needle))
    ) {
      return false;
    }
    if (intent.maxAgeHours) {
      const t = Date.parse(job.posted || "");
      if (!Number.isFinite(t)) {
        // LinkedIn guest often returns relative times Date.parse can't handle; upstream timeRange narrows fetch.
        return true;
      }
      const ageHours = (now - t) / (1000 * 60 * 60);
      if (ageHours > intent.maxAgeHours) return false;
    }
    return true;
  });
}

export function buildAppliedFilterNote(intent: ParsedJobSearchIntent): string {
  const bits: string[] = [];
  if (intent.maxAgeHours) bits.push(`time <= ${intent.maxAgeHours}h`);
  if (intent.companyNeedles.length > 0)
    bits.push(`company: ${intent.companyNeedles.join(", ")}`);
  if (intent.domainNeedles.length > 0) bits.push("domain: life sciences");
  if (bits.length === 0) return "";
  return `\n\n**Applied filters:** ${bits.join(" · ")}`;
}

/**
 * True when the user is asking for **external** job listings (LinkedIn guest search path),
 * not tracker / applications.md inventory or strategy-only questions.
 */
export function isLikelyJobSearchIntent(text: string): boolean {
  const raw = text.trim();

  const trackerLean =
    /\b(jobs?|roles?|openings?)\b.*\btracker\b|\btracker\b.*\b(jobs?|roles?|openings?|applications)\b|\b(in|from)\s+my\s+tracker\b|\bapplications\.md\b|\bdata\/applications\b|\bscan[-\s]?history\b/i.test(
      raw,
    );
  const explicitListing =
    /\blinked[\s-]?in\b|\ball\s+(the\s+)?jobs?\b|\b(any\s+)?new\s+jobs?\b|\b(find|search|get|fetch|show|give|list)(\s+me)?\s+(all\s+)?(the\s+)?(jobs?|roles?|postings?|openings?|vacancies)\b/i.test(
      raw,
    );
  if (trackerLean && !explicitListing) return false;

  if (explicitListing) return true;

  if (
    /\b(greenhouse|ashby|lever|workday|careers?\s+site|job\s+board)\b/i.test(raw)
  ) {
    return true;
  }

  if (
    /\b(last|past|yesterday|recent|posted|hiring)\b/i.test(raw) &&
    /\b(job|jobs|role|roles|opening|openings|career|careers)\b/i.test(raw)
  ) {
    return true;
  }

  if (
    /\b(last\s+\d+\s*(h|hr|hrs|hour|hours|day|days))\b/i.test(raw) &&
    /\b(job|jobs|role|roles)\b/i.test(raw)
  ) {
    return true;
  }

  return false;
}
