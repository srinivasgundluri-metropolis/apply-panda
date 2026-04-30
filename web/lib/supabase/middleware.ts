import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { getSupabaseEnv } from "./env";

export async function updateAuthSession(
  request: NextRequest,
  response: NextResponse,
) {
  const env = getSupabaseEnv();
  if (!env) return null;
  const { url, anon } = env;
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const c of cookiesToSet) {
          response.cookies.set(c.name, c.value, c.options);
        }
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

