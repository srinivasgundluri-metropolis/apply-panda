import { NextResponse } from "next/server";
import { ForbiddenError, requireUser } from "./server";

type ApiAuthOk = Awaited<ReturnType<typeof requireUser>>;
type ApiAuthResult =
  | (ApiAuthOk & { ok: true; response: null })
  | { ok: false; response: NextResponse };

export async function requireApiUser(): Promise<ApiAuthResult> {
  try {
    const { user, supabase } = await requireUser();
    return { ok: true, user, supabase, response: null };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Access is restricted for this account." },
          { status: 403 },
        ),
      };
    }
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
}

