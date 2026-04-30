import { NextRequest, NextResponse } from "next/server";
import { patchApplicationRow } from "@/lib/parse-applications";
import { CANONICAL_STATES } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ num: string }> },
) {
  // Next 16: dynamic route params are a Promise.
  const { num } = await context.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const patch = body as { status?: string; notes?: string; pdf?: string };

  // Validate status if present — preserves the canonical-states invariant
  // documented in templates/states.yml. Unknown values get rejected here
  // so the markdown table never accumulates ad-hoc statuses.
  if (
    patch.status !== undefined &&
    !CANONICAL_STATES.includes(patch.status as never)
  ) {
    return NextResponse.json(
      {
        error: `Invalid status "${patch.status}". Allowed: ${CANONICAL_STATES.join(
          ", ",
        )}`,
      },
      { status: 400 },
    );
  }

  try {
    const ok = await patchApplicationRow(num, patch);
    if (!ok) {
      return NextResponse.json(
        { error: `No row found with # = ${num}` },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
