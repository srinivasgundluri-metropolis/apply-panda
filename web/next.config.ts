import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  // Pin the Turbopack workspace root to the `web/` folder so Next.js doesn't
  // get confused by the parent career-ops repo's package-lock.json.
  turbopack: {
    root: resolve(__dirname),
  },
  // Headless Chromium (PDF) — avoid bundling issues on serverless bundles.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  // Next output tracing often skips binary assets; Sparticuz needs `bin/*.br`.
  outputFileTracingIncludes: {
    "/api/docs/generate": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
    "/api/docs/pdf-probe": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
  },
};

export default nextConfig;
