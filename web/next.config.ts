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
/**
 * Remote Vercel Git builds expose system env (`VERCEL_DEPLOYMENT_ID`, etc.).
 * Local `vercel build` sets `VERCEL` but disables those vars — combining a repo-root
 * `outputFileTracingRoot` with the CLI shim then resolves `web/web/.next`, ENOENT after build.
 */
const onRemoteVercelBuild =
  Boolean(process.env.VERCEL?.trim()) && Boolean(process.env.VERCEL_DEPLOYMENT_ID?.trim());

const nextConfig: NextConfig = {
  turbopack: {
    root: onRemoteVercelBuild ? repoRoot : webRoot,
  },
  ...(onRemoteVercelBuild ? { outputFileTracingRoot: repoRoot } : {}),
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
