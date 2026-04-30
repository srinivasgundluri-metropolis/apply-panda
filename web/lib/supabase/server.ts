import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./env";
import { isEmailAllowed } from "@/lib/auth-allowlist";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function createSupabaseServerClient() {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error(
      "Supabase env missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  const { url, anon } = env;
  const cookieStore = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const c of cookiesToSet) {
          cookieStore.set(c.name, c.value, c.options);
        }
      },
    },
  });
}

export async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new UnauthorizedError();
  if (!isEmailAllowed(user.email)) {
    throw new ForbiddenError("Access is restricted for this account.");
  }
  return { supabase, user };
}

