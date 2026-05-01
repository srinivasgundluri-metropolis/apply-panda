import type { NextConfig } from "next";
import { resolve } from "node:path";

/**
 * Vercel (Fluid / monorepo) injects `outputFileTracingRoot` as the git checkout
 * root (`/vercel/path0`). Next 16 requires `turbopack.root` to match that value or
 * it warns. Locally we keep the workspace pinned to `web/` so Turbopack does not
 * pick up a parent `package-lock.json` from the career-ops repo.
 */
const webRoot = resolve(__dirname);
const repoRoot = resolve(__dirname, "..");
const onVercel = Boolean(process.env.VERCEL);

const nextConfig: NextConfig = {
  turbopack: {
    root: onVercel ? repoRoot : webRoot,
  },
  ...(onVercel ? { outputFileTracingRoot: repoRoot } : {}),
  // Headless Chromium (PDF) — avoid bundling issues on serverless bundles.
  serverExternalPackages: [
    "puppeteer-core",
    "@sparticuz/chromium",
    "html-to-docx",
  ],
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
