import { NextResponse } from "next/server";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Playing a voice message.
 *
 * The `voice-messages` storage policies only let a member read files in their
 * own folder — which is right for uploads and useless for playback, since the
 * whole point is that somebody else hears it. The storage migration flagged
 * itself incomplete about exactly this and named two ways out: a storage policy
 * joining to the messages table, or signed URLs minted after an app-level check.
 *
 * This is the second, for the reason given there: the rule about who may hear a
 * message is already written, once, as `chat_messages`' own RLS. Asking it
 * directly is more reliable than restating it in a policy that has to be kept in
 * step by hand.
 *
 * So the row is read with the member's session — if they can't see the message,
 * they get nothing and no URL — and only the signing uses the service role.
 */
const SIGNED_URL_SECONDS = 60 * 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  await requireMember();
  const { messageId } = await params;

  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_messages")
    .select("voice_path")
    .eq("id", messageId)
    .maybeSingle();

  const message = data as { voice_path: string | null } | null;

  // Not in a channel they can see, not there, or not a voice message. All three
  // get the same answer — confirming a message exists to someone who can't read
  // it is a small leak with no upside.
  if (!message?.voice_path) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage
    .from("voice-messages")
    .createSignedUrl(message.voice_path, SIGNED_URL_SECONDS);

  if (error || !signed?.signedUrl) {
    return NextResponse.json(
      { error: error?.message ?? "Couldn't prepare that." },
      { status: 500 },
    );
  }

  // Redirect rather than proxying: seeking and range requests stay Supabase's
  // problem rather than ours.
  return NextResponse.redirect(signed.signedUrl, {
    status: 307,
    headers: { "Cache-Control": "private, no-store" },
  });
}
