import type { PortalsTrackedCompany } from "@/lib/types";

/**
 * Curated ATS career URLs ApplyPanda hits without scraping.
 * Hosted portal scans **always** use this directory — user profiles only supply title + location targeting.
 *
 * Maintain API-mappable URLs only (Greenhouse / Ashby / Lever / Workday patterns); avoid branded vanity pages.
 */
export const DEFAULT_PORTAL_CATALOG: readonly PortalsTrackedCompany[] = [
  { name: "Anthropic", enabled: true, careers_url: "https://job-boards.greenhouse.io/anthropic" },
  { name: "PolyAI", enabled: true, careers_url: "https://job-boards.eu.greenhouse.io/polyai" },
  { name: "Parloa", enabled: true, careers_url: "https://job-boards.eu.greenhouse.io/parloa" },
  { name: "Intercom", enabled: true, careers_url: "https://job-boards.greenhouse.io/intercom" },
  { name: "Hume", enabled: true, careers_url: "https://job-boards.greenhouse.io/humeai" },
  { name: "ElevenLabs", enabled: true, careers_url: "https://jobs.ashbyhq.com/elevenlabs" },
  { name: "Deepgram", enabled: true, careers_url: "https://jobs.ashbyhq.com/deepgram" },
  { name: "Vapi", enabled: true, careers_url: "https://jobs.ashbyhq.com/vapi" },
  { name: "Bland", enabled: true, careers_url: "https://jobs.ashbyhq.com/bland" },
  { name: "Airtable", enabled: true, careers_url: "https://job-boards.greenhouse.io/airtable" },
  { name: "Vercel", enabled: true, careers_url: "https://job-boards.greenhouse.io/vercel" },
  { name: "Temporal", enabled: true, careers_url: "https://job-boards.greenhouse.io/temporal" },
  { name: "Arize", enabled: true, careers_url: "https://job-boards.greenhouse.io/arizeai" },
  { name: "Runpod", enabled: true, careers_url: "https://job-boards.greenhouse.io/runpod" },
  { name: "Glean", enabled: true, careers_url: "https://job-boards.greenhouse.io/gleanwork" },
  { name: "Ada", enabled: true, careers_url: "https://job-boards.greenhouse.io/ada" },
  { name: "Sierra", enabled: true, careers_url: "https://jobs.ashbyhq.com/sierra" },
  { name: "Decagon", enabled: true, careers_url: "https://jobs.ashbyhq.com/decagon" },
  { name: "Speechmatics", enabled: true, careers_url: "https://job-boards.greenhouse.io/speechmatics" },
  { name: "Cohere", enabled: true, careers_url: "https://jobs.ashbyhq.com/cohere" },
  { name: "LangChain", enabled: true, careers_url: "https://jobs.ashbyhq.com/langchain" },
  { name: "Pinecone", enabled: true, careers_url: "https://jobs.ashbyhq.com/pinecone" },
  { name: "Mistral", enabled: true, careers_url: "https://jobs.lever.co/mistral" },
  { name: "W&B", enabled: true, careers_url: "https://jobs.lever.co/wandb" },
  { name: "Sanctuary AI", enabled: true, careers_url: "https://jobs.lever.co/sanctuary" },
  { name: "Factorial", enabled: true, careers_url: "https://job-boards.greenhouse.io/factorial" },
  { name: "Attio", enabled: true, careers_url: "https://jobs.ashbyhq.com/attio" },
  { name: "Tinybird", enabled: true, careers_url: "https://jobs.ashbyhq.com/tinybird" },
  { name: "Clarity AI", enabled: true, careers_url: "https://jobs.lever.co/clarity-ai" },
  { name: "Aleph Alpha", enabled: true, careers_url: "https://jobs.ashbyhq.com/AlephAlpha" },
  { name: "DeepL", enabled: true, careers_url: "https://jobs.ashbyhq.com/DeepL" },
  { name: "Black Forest Labs", enabled: true, careers_url: "https://job-boards.greenhouse.io/blackforestlabs" },
  { name: "Helsing", enabled: true, careers_url: "https://job-boards.greenhouse.io/helsing" },
  { name: "Celonis", enabled: true, careers_url: "https://job-boards.greenhouse.io/celonis" },
  { name: "N26", enabled: true, careers_url: "https://job-boards.greenhouse.io/n26" },
  { name: "SumUp", enabled: true, careers_url: "https://job-boards.greenhouse.io/sumup" },
  { name: "Forto", enabled: true, careers_url: "https://jobs.lever.co/forto" },
  { name: "Qonto", enabled: true, careers_url: "https://jobs.lever.co/qonto" },
  { name: "Lakera", enabled: true, careers_url: "https://jobs.ashbyhq.com/lakera.ai" },
  { name: "PhysicsX", enabled: true, careers_url: "https://job-boards.greenhouse.io/physicsx" },
  { name: "Wayve", enabled: true, careers_url: "https://job-boards.greenhouse.io/wayve" },
  { name: "Synthesia", enabled: true, careers_url: "https://jobs.ashbyhq.com/synthesia" },
  { name: "Faculty", enabled: true, careers_url: "https://jobs.ashbyhq.com/faculty" },
  { name: "Photoroom", enabled: true, careers_url: "https://jobs.ashbyhq.com/photoroom" },
  { name: "Scandit", enabled: true, careers_url: "https://job-boards.greenhouse.io/scandit" },
];

export const DEFAULT_PORTAL_CATALOG_SIZE = DEFAULT_PORTAL_CATALOG.length;

export function defaultCatalogCopy(): PortalsTrackedCompany[] {
  return DEFAULT_PORTAL_CATALOG.map((c) => ({ ...c }));
}
