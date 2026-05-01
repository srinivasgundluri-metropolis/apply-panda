/**
 * Quick-select presets for employer boards. These are **heuristic HQ guesses** for UX only —
 * not legal US/EU registration data (ATS URLs don’t encode incorporation reliably).
 */

import { DEFAULT_PORTAL_CATALOG } from "@/lib/default-portal-catalog";
import { portalCatalogKey } from "@/lib/portal-catalog-keys";

/** Names in {@link DEFAULT_PORTAL_CATALOG} treated as a rough “US tech” shortcut. */
const APPROX_US_NAMES = new Set<string>([
  "Ada",
  "Airtable",
  "Amplemarket",
  "Anthropic",
  "Arize",
  "Black Forest Labs",
  "Bland",
  "Boomi",
  "Clarity AI",
  "Clerk",
  "Clay Labs",
  "Coinbase",
  "Contentful",
  "Cradle",
  "Decagon",
  "Deepgram",
  "Dropbox",
  "Duolingo",
  "ElevenLabs",
  "Figma",
  "Glacis AI",
  "Glean",
  "Hightouch",
  "Hootsuite",
  "Hume",
  "Inngest",
  "Intercom",
  "Isomorphic Labs",
  "LangChain",
  "Later",
  "Linear",
  "Lovable",
  "Mercury",
  "Palantir",
  "Perplexity",
  "Photoroom",
  "Pinecone",
  "PlanetScale",
  "Replit",
  "Resend",
  "Robinhood",
  "Runpod",
  "Runway",
  "Safari AI",
  "Sanctuary AI",
  "Sierra",
  "Spotify",
  "Stability AI",
  "Stripe",
  "Supabase",
  "Temporal",
  "Tinybird",
  "Vapi",
  "Vercel",
  "W&B",
  "WorkOS",
  "Zapier",
]);

/** Names biased toward EU / UK roles (still heuristic). */
const APPROX_EU_UK_NAMES = new Set<string>([
  "Aleph Alpha",
  "Causaly",
  "Celonis",
  "DeepL",
  "Faculty",
  "Factorial",
  "Forto",
  "GetYourGuide",
  "HelloFresh",
  "Helsing",
  "Klue",
  "Lakera",
  "Legora",
  "Mistral",
  "N26",
  "Parloa",
  "PhysicsX",
  "PolyAI",
  "Qonto",
  "Sanctuary AI",
  "SumUp",
  "Trade Republic",
  "Travelperk",
  "Vinted",
  "Wayve",
]);

function keysForNameSet(names: Set<string>): Set<string> {
  const keys = new Set<string>();
  for (const c of DEFAULT_PORTAL_CATALOG) {
    if (c.name && names.has(c.name)) keys.add(portalCatalogKey(c));
  }
  return keys;
}

export function presetApproxUsKeys(): Set<string> {
  return keysForNameSet(APPROX_US_NAMES);
}

export function presetApproxEuUkKeys(): Set<string> {
  return keysForNameSet(APPROX_EU_UK_NAMES);
}

export function allCatalogKeys(): Set<string> {
  return new Set(DEFAULT_PORTAL_CATALOG.map((c) => portalCatalogKey(c)));
}
