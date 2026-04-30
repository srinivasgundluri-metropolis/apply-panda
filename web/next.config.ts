import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  // Pin the Turbopack workspace root to the `web/` folder so Next.js doesn't
  // get confused by the parent career-ops repo's package-lock.json.
  turbopack: {
    root: resolve(__dirname),
  },
  // Portal scan reads YAML at runtime; ensure it ships in serverless bundles (Vercel).
  outputFileTracingIncludes: {
    "/api/portals/search": ["./data/bundled-portals.yml"],
    "/api/scan/run": ["./data/bundled-portals.yml"],
  },
};

export default nextConfig;
