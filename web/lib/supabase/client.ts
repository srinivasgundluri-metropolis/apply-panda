"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

export function createSupabaseBrowserClient() {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error(
      "Supabase env missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  const { url, anon } = env;
  return createBrowserClient(url, anon);
}

