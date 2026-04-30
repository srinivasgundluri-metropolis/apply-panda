import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateAuthSession } from "@/lib/supabase/middleware";
import { isEmailAllowed } from "@/lib/auth-allowlist";

/** Must match bundled default favicon path so browsers get the JPEG content. */
const LOGO_SEGMENT = "/logo/f6e75545-5238-4561-8e59-d39e0c9d0efe.jpeg";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/tracker",
  "/chat",
  "/pipeline",
  "/scan-results",
  "/documents",
  "/profile",
];

const PUBLIC_API_PREFIXES = ["/api/outreach/config"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const lockdown = process.env.APPLYPANDA_LOCKDOWN === "true";

  if (lockdown) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Service temporarily unavailable for safety checks." },
        { status: 503 },
      );
    }
    return new NextResponse(
      "Service temporarily unavailable for safety checks. Please try again later.",
      {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      },
    );
  }

  // Keep favicon rewrite behavior.
  if (pathname === "/favicon.ico") {
    const url = request.nextUrl.clone();
    url.pathname = LOGO_SEGMENT;
    url.search = "";
    return NextResponse.rewrite(url);
  }

  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/logo/") ||
    pathname.startsWith("/auth")
  ) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  let user = null;
  try {
    user = await updateAuthSession(request, response);
  } catch {
    // If env is missing, don't hard-crash middleware in dev.
    user = null;
  }

  const isProtectedPage = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isApi = pathname.startsWith("/api/");
  const isPublicApi = PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));
  const allowed = user ? isEmailAllowed(user.email) : true;

  if ((!user || !allowed) && (isProtectedPage || (isApi && !isPublicApi))) {
    if (isApi) {
      return NextResponse.json(
        { error: user ? "Access restricted" : "Unauthorized" },
        { status: user ? 403 : 401 },
      );
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth";
    loginUrl.searchParams.set("next", pathname);
    if (user && !allowed) loginUrl.searchParams.set("blocked", "1");
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/auth" && allowed) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: "/:path*",
};
