import { NextResponse } from "next/server";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Serving library content (§11).
 *
 * The whole export rule rests on this route being the only way in. The bucket is
 * private and has no member policy, so nothing here is reachable without a
 * signed URL, and signed URLs are only minted after two checks:
 *
 *   1. The member is signed in and has portal access.
 *   2. `training_content`'s own RLS returns the row *for them* — which is what
 *      enforces the onboarding tiering. An onboarding member asking for an
 *      active-only item gets nothing back and therefore no URL.
 *
 * The second check is why the row is read with the member's session rather than
 * the service role: the policy already expresses who may see what, and asking it
 * directly is more reliable than restating the rule here.
 *
 * The signed URL does end up visible in the browser's network panel. That's the
 * accepted limit of "soft" protection — §11 is explicit that this is the Kajabi
 * and Teachable approach, not something to over-engineer past.
 */
const SIGNED_URL_SECONDS = 60 * 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireMember();
  const { id } = await params;

  // The member's own client: RLS decides whether this item exists for them.
  const supabase = await createClient();
  const { data } = await supabase
    .from("training_content")
    .select("asset_path, format, title")
    .eq("id", id)
    .maybeSingle();

  const content = data as
    | { asset_path: string | null; format: string; title: string }
    | null;

  if (!content) {
    // Not published, not in their tier, or not there. All three deserve the
    // same answer — telling someone an item exists but isn't for them is a
    // small leak with no upside.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!content.asset_path) {
    return NextResponse.json(
      { error: "That one has no file attached yet." },
      { status: 404 },
    );
  }

  // Service role only for the signing — never for deciding who may watch.
  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage
    .from("training-content")
    .createSignedUrl(content.asset_path, SIGNED_URL_SECONDS);

  if (error || !signed?.signedUrl) {
    return NextResponse.json(
      { error: error?.message ?? "Couldn't prepare that file." },
      { status: 500 },
    );
  }

  // Redirect rather than proxying the bytes: streaming and seeking work
  // properly, and range requests are Supabase's problem rather than ours.
  return NextResponse.redirect(signed.signedUrl, {
    status: 307,
    headers: { "Cache-Control": "private, no-store" },
  });
}
