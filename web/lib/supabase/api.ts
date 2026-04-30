import { NextResponse } from "next/server";
import { requireUser } from "./server";

type ApiAuthOk = Awaited<ReturnType<typeof requireUser>>;
type ApiAuthResult =
  | (ApiAuthOk & { ok: true; response: null })
  | { ok: false; response: NextResponse };

export async function requireApiUser(): Promise<ApiAuthResult> {
  try {
    const { user, supabase } = await requireUser();
    return { ok: true, user, supabase, response: null };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
}

