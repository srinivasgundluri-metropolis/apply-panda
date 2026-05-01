import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/api";
import {
  getPdfLauncherDiagnostics,
  probePdfBrowserLaunch,
} from "@/lib/pdf-from-html";

export const dynamic = "force-dynamic";

/**
 * GET — returns launcher environment + tries one Puppeteer/Chromium startup.
 * Debug Chromium/Puppeteer launcher for tailored PDF export. Open logged-in, then
 * `/api/docs/pdf-probe`, copy JSON for issues.
 */
export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const diagnostics = getPdfLauncherDiagnostics();
  const launch = await probePdfBrowserLaunch();
  const status = launch.ok ? 200 : 500;
  return NextResponse.json(
    {
      ok: launch.ok,
      diagnostics,
      launchProbe: launch,
    },
    { status },
  );
}
