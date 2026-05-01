/**
 * Render print-oriented HTML to PDF using headless Chrome.
 * - On Vercel: puppeteer-core + @sparticuz/chromium
 * - Locally: system Chrome via PUPPETEER_EXECUTABLE_PATH or common install paths
 */

import puppeteer from "puppeteer-core";
import type { Browser } from "puppeteer-core";

function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

export async function launchPdfBrowser(): Promise<Browser> {
  if (isServerless()) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const exe =
    process.env.PUPPETEER_EXECUTABLE_PATH?.trim() ||
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : process.platform === "win32"
        ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
        : "/usr/bin/google-chrome-stable");

  return puppeteer.launch({
    executablePath: exe,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
}

export async function htmlToPdfWithBrowser(
  browser: Browser,
  html: string,
): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 90_000 });
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
