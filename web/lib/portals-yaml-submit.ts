/**
 * Client-side parse of career-ops `portals.yml` snippets before saving `profiles.data.portals`.
 */

import YAML from "yaml";
import { normalizeHostedPortalsPayload } from "@/lib/hosted-profile-portals";
import type { PortalsYamlConfig } from "@/lib/types";

const MAX_YAML_CHARS = 400_000;

const PORTALS_YAML_PLACEHOLDER = `# Paste employers from your career-ops repo file portals.yml (root of the project).
# Title/location "positive" filters come from Profile → Targeting above; this YAML
# supplies tracked_companies (+ optional title/location negatives, company_filter).

tracked_companies:
  - name: ExampleCo
    enabled: true
    careers_url: https://job-boards.greenhouse.io/exampleco
`;

export class PortalsYamlUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortalsYamlUserError";
  }
}

/** Text shown when nothing is stored yet (valid YAML; replace ExampleCo before saving). */
export function defaultHostedPortalsYamlPlaceholder(): string {
  return PORTALS_YAML_PLACEHOLDER.trimEnd();
}

export function hostedPortalsYamlTextFromStored(
  portals: PortalsYamlConfig | null | undefined,
): string {
  const n = portals ? normalizeHostedPortalsPayload(portals) : null;
  if (!n?.tracked_companies?.length) return defaultHostedPortalsYamlPlaceholder();
  const forFile: PortalsYamlConfig = {
    tracked_companies: n.tracked_companies,
    ...(n.company_filter ? { company_filter: n.company_filter } : {}),
    ...(n.title_filter?.negative?.length
      ? { title_filter: { negative: n.title_filter.negative } }
      : {}),
    ...(n.location_filter?.negative?.length
      ? { location_filter: { negative: n.location_filter.negative } }
      : {}),
  };
  return YAML.stringify(forFile, { lineWidth: 100 }).trimEnd();
}

export function parseHostedPortalsYamlText(text: string): PortalsYamlConfig {
  const t = text.trim();
  if (!t.length) {
    throw new PortalsYamlUserError(
      "Paste your portals.yml snippet (tracked_companies is required).",
    );
  }
  if (t.length > MAX_YAML_CHARS) {
    throw new PortalsYamlUserError("That YAML is too large (max 400k characters).");
  }

  let doc: unknown;
  try {
    doc = YAML.parse(t, { maxAliasCount: 100 });
  } catch (e) {
    throw new PortalsYamlUserError(`Invalid YAML: ${(e as Error).message}`);
  }

  const normalized = normalizeHostedPortalsPayload(doc);
  if (!normalized) {
    throw new PortalsYamlUserError(
      "No usable tracked_companies rows: each entry needs careers_url (or api) for a Greenhouse, Ashby, Lever, or Workday board.",
    );
  }

  return normalized;
}
