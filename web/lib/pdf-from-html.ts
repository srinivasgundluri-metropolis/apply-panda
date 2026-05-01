/**
 * Render print-oriented HTML to PDF using headless Chrome.
 * - On Vercel: puppeteer-core + @sparticuz/chromium
 * - Locally: system Chrome via PUPPETEER_EXECUTABLE_PATH or common install paths
 */

import puppeteer from "puppeteer-core";
import type { Browser } from "puppeteer-core";

/**
 * Use @sparticuz/chromium only on real serverless **Linux** runtimes.
 *
 * `vercel dev` sets `VERCEL=1` on your laptop (macOS/Windows); the bundled
 * Chromium is Linux-only and throws "Failed to launch the browser process!".
 * In that case we must use a local Chrome/Chromium install instead.
 */
function shouldUseBundledLambdaChromium(): boolean {
  if (process.platform !== "linux") return false;
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return true;
  if (!process.env.VERCEL) return false;
  if (process.env.VERCEL_ENV === "development") return false;
  return true;
}

export async function launchPdfBrowser(): Promise<Browser> {
  if (shouldUseBundledLambdaChromium()) {
    const chromium = (await import("@sparticuz/chromium")).default;
    try {
      return await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });
    } catch (e) {
      const inner = (e as Error).message ?? String(e);
      throw new Error(
        `${inner} (Vercel PDF: raise function memory or align @sparticuz/chromium with puppeteer-core if this persists.)`,
      );
    }
  }

  const exe =
    process.env.PUPPETEER_EXECUTABLE_PATH?.trim() ||
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : process.platform === "win32"
        ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
        : "/usr/bin/google-chrome-stable");

  try {
    return await puppeteer.launch({
      executablePath: exe,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
  } catch (e) {
    const inner = (e as Error).message ?? String(e);
    throw new Error(
      `${inner} Install Google Chrome or set PUPPETEER_EXECUTABLE_PATH to its binary (${exe}).`,
    );
  }
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
