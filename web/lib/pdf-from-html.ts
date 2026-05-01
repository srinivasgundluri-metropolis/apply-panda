/**
 * Render print-oriented HTML to PDF using headless Chrome.
 * - On hosted Vercel (Linux preview/production regions): puppeteer-core + @sparticuz/chromium
 * - Everywhere else: system Chrome/Chromium via PUPPETEER_EXECUTABLE_PATH or known paths
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import type { Browser } from "puppeteer-core";

/** Args that help flaky headless launches (local + thin containers). */
const LOCAL_LAUNCH_EXTRA = [
  "--disable-gpu",
  "--disable-software-rasterizer",
] as const;

/**
 * Sparticuz's default `executablePath()` uses `join(__dirname, '..', 'bin')`. Inside a Next.js
 * server bundle, `__dirname` often points at `.next/server/...`, so `bin/` is missing and
 * Puppeteer dies with “Failed to launch the browser process!”. Resolve the real package path.
 */
function tryResolveSparticuzBinDir(): string | null {
  try {
    const here = fileURLToPath(import.meta.url);
    const rq = createRequire(here);
    const pkgJson = rq.resolve("@sparticuz/chromium/package.json");
    const binDir = join(dirname(pkgJson), "bin");
    if (existsSync(binDir)) return binDir;
  } catch {
    // fall through to cwd-relative
  }
  const cwdBin = join(
    process.cwd(),
    "node_modules",
    "@sparticuz",
    "chromium",
    "bin",
  );
  return existsSync(cwdBin) ? cwdBin : null;
}

/**
 * Sparticuz ships a Linux Chromium for Lambda-sized runtimes — not for laptops.
 *
 * pitfalls:
 * - `vercel dev` sets `VERCEL=1` on macOS/Windows → we skip via `platform !== linux`.
 * - `VERCEL_ENV` is often undefined under `vercel dev` ([vercel/cli#14450]). On Linux that
 *   used to imply “use bundle” → wrong. Require explicit `preview` | `production`, or Lambda.
 * - When in doubt locally, pull `preview`/`production` vars from `.vercel`; use
 *   `shouldUseBundledLambdaChromium` only on real deployments (`VERCEL_REGION` ≠ `dev1`).
 */
function shouldUseBundledLambdaChromium(): boolean {
  /** Override when `.env*` pulled production/preview vars into local Linux dev. */
  const forceLocal = (
    process.env.APPLYPANDA_FORCE_LOCAL_CHROME ?? ""
  ).trim();
  if (["1", "true", "yes"].includes(forceLocal.toLowerCase())) return false;

  if (process.platform !== "linux") return false;
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return true;
  const region = process.env.VERCEL_REGION;
  if (region === "dev1") return false;
  if (!process.env.VERCEL) return false;

  const env = process.env.VERCEL_ENV;
  if (env === "preview" || env === "production") return true;

  return false;
}

function localChromeCandidatePaths(): string[] {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (fromEnv) return [fromEnv];

  const out: string[] = [];
  if (process.platform === "darwin") {
    out.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/opt/homebrew/bin/chromium",
      "/usr/local/bin/chromium",
      "/usr/local/bin/chrome",
    );
  } else if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      out.push(join(localAppData, "Google", "Chrome", "Application", "chrome.exe"));
      out.push(join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"));
    }
    const pf = process.env["ProgramFiles"];
    const pf86 = process.env["ProgramFiles(x86)"];
    if (pf) {
      out.push(join(pf, "Google", "Chrome", "Application", "chrome.exe"));
      out.push(join(pf, "Microsoft", "Edge", "Application", "msedge.exe"));
    }
    if (pf86) {
      out.push(join(pf86, "Google", "Chrome", "Application", "chrome.exe"));
      out.push(join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"));
    }
    out.push("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
    out.push(
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    );
  } else {
    out.push(
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/snap/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/microsoft-edge",
      "/usr/bin/microsoft-edge-stable",
    );
  }
  return out;
}

/**
 * Prefer an existing filesystem path when we have multiple guesses (Linux package names vary).
 */
function orderedLocalChromePaths(): string[] {
  const raw = localChromeCandidatePaths();
  const seen = new Set<string>();
  const unique = raw.filter((p) => {
    if (!p || seen.has(p)) return false;
    seen.add(p);
    return true;
  });

  const existing = unique.filter((p) => existsSync(p));
  if (existing.length > 0) return existing;

  return unique.length > 0 ? unique : ["/usr/bin/google-chrome-stable"];
}

async function launchLocalChromeBrowser(): Promise<Browser> {
  const paths = orderedLocalChromePaths();
  const headlessAttempts: ReadonlyArray<true | "shell"> = [true, "shell"];
  const errors: string[] = [];

  const baseArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    ...LOCAL_LAUNCH_EXTRA,
  ];

  for (const exe of paths) {
    for (const headless of headlessAttempts) {
      try {
        return await puppeteer.launch({
          executablePath: exe,
          headless,
          args: [...baseArgs],
        });
      } catch (e) {
        errors.push(
          `${exe} headless=${String(headless)}: ${(e as Error).message}`,
        );
      }
    }
  }

  throw new Error(
    `Cannot start Chrome/Chromium/Edge for PDF. Tried:\n${errors.map((x) => `  - ${x}`).join("\n")}\n` +
      `Install a Chromium-based browser or set PUPPETEER_EXECUTABLE_PATH to its binary.`,
  );
}

export async function launchPdfBrowser(): Promise<Browser> {
  if (shouldUseBundledLambdaChromium()) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const binDir = tryResolveSparticuzBinDir();
    try {
      const executablePath = binDir
        ? await chromium.executablePath(binDir)
        : await chromium.executablePath();
      return await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath,
        headless: chromium.headless,
      });
    } catch (e) {
      const binHint = binDir ? ` Resolved @sparticuz/chromium/bin at ${binDir}.` : " Used default chromium.executablePath (check Vercel build includes node_modules/@sparticuz/chromium/bin).";
      const inner = (e as Error).message ?? String(e);
      const archHint =
        process.arch === "arm64"
          ? " Vercel ARM functions are not compatible with this Sparticuz x86 Chromium build."
          : "";
      throw new Error(
        `${inner}${binHint}${archHint} Bump function memory in Vercel (see web/vercel.json), or set APPLYPANDA_FORCE_LOCAL_CHROME=1 and PUPPETEER_EXECUTABLE_PATH on a machine with Chrome.`,
      );
    }
  }

  return launchLocalChromeBrowser();
}

export async function htmlToPdfWithBrowser(
  browser: Browser,
  html: string,
): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    // Avoid networkidle0: static tailor HTML rarely needs idle; idle often
    // times out under serverless Puppeteer while remote fonts spin.
    await page.setContent(html, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
