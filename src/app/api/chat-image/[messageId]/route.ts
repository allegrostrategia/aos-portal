import { NextResponse } from "next/server";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Showing an image message (round 2, E2).
 *
 * The same shape as /api/voice: the row is read with the member's own session,
 * so a message in a channel they can't see is a 404 and no URL; only the
 * signing uses the service role. The `chat-images` bucket has no member read
 * beyond their own folder, so this route is the only way a picture is ever
 * seen, and it is never a public URL.
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
    .select("image_path")
    .eq("id", messageId)
    .maybeSingle();

  const message = data as { image_path: string | null } | null;
  if (!message?.image_path) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage
    .from("chat-images")
    .createSignedUrl(message.image_path, SIGNED_URL_SECONDS);

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? "Couldn't prepare that." }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl, {
    status: 307,
    headers: { "Cache-Control": "private, no-store" },
  });
}
