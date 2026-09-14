import "server-only";

import webPush from "web-push";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sending a push notification (round 2 brief, F).
 *
 * Runs with the service role — it has to read other members' subscriptions —
 * and only ever from server code that has already decided who should hear
 * about what. Two triggers exist: a new message in a room (everyone in the
 * room except the sender, who has push_chat on) and a reaction (the message's
 * author, if push_reactions is on).
 *
 * **Triggered from the app, not from a database webhook.** The reference this
 * was adapted from fired from a Supabase webhook with a shared secret. Here the
 * server actions that insert a message or a reaction call this in `after()`,
 * once the response is on its way. Every path the app has for creating those
 * rows goes through those actions, so nothing is missed, and there is no
 * dashboard step to configure and no fourth secret. If a second producer of
 * messages ever appears (an import, a bot), a webhook route is the right
 * addition then.
 *
 * VAPID: three environment variables, read at call time so the app builds and
 * runs without them — push simply doesn't send until they are set, and says
 * so once in the log rather than on every message.
 *
 * A 404 or 410 from the push service means the device is gone; the row is
 * marked expired rather than deleted, so a re-subscribe from the same
 * endpoint replaces it cleanly.
 */

type Payload = { title: string; body: string; url: string; tag?: string };

let warnedOnce = false;

function configured(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) {
    if (!warnedOnce) {
      console.warn("[push] VAPID keys not set; push notifications are off. See CLAUDE.md.");
      warnedOnce = true;
    }
    return false;
  }
  webPush.setVapidDetails(subject, pub, priv);
  return true;
}

async function sendTo(memberIds: string[], payload: Payload): Promise<number> {
  if (memberIds.length === 0 || !configured()) return 0;
  const admin = createAdminClient();

  const { data } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("member_id", memberIds)
    .is("expired_at", null);

  const subs = (data ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[];
  let sent = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 },
        );
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin
            .from("push_subscriptions")
            .update({ expired_at: new Date().toISOString() })
            .eq("id", sub.id);
        } else {
          console.warn("[push] send failed", status ?? error);
        }
      }
    }),
  );
  return sent;
}

/** A new message: everyone else in the room who has push on for messages. */
export async function pushForMessage(messageId: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("chat_messages")
    .select("id, channel_id, member_id, body, voice_path, image_path")
    .eq("id", messageId)
    .maybeSingle();
  const message = data as {
    id: string;
    channel_id: string;
    member_id: string;
    body: string | null;
    voice_path: string | null;
    image_path: string | null;
  } | null;
  if (!message) return 0;

  const [{ data: participants }, { data: senderRow }, { data: channelRow }] = await Promise.all([
    admin.from("chat_participants").select("member_id").eq("channel_id", message.channel_id),
    admin.from("members").select("full_name").eq("id", message.member_id).maybeSingle(),
    admin.from("chat_channels").select("kind, slug, name").eq("id", message.channel_id).maybeSingle(),
  ]);
  const room = channelRow as { kind: "group" | "direct"; slug: string | null; name: string | null } | null;
  const others = ((participants ?? []) as { member_id: string }[])
    .map((p) => p.member_id)
    .filter((id) => id !== message.member_id);
  if (others.length === 0) return 0;

  const { data: wanting } = await admin
    .from("members")
    .select("id")
    .in("id", others)
    .eq("push_chat", true)
    .in("status", ["active", "onboarding"]);
  const recipients = ((wanting ?? []) as { id: string }[]).map((r) => r.id);

  const sender = ((senderRow as { full_name: string } | null)?.full_name ?? "Someone").split(" ")[0];
  const where = room?.kind === "group" ? ` in ${room.name ?? "the room"}` : "";
  const what = message.body
    ? message.body.length > 120 ? `${message.body.slice(0, 117)}…` : message.body
    : message.voice_path ? "Sent a voice note" : "Sent a picture";
  const href = room?.kind === "group" ? `/sociale/${room.slug ?? message.channel_id}` : `/sociale/${message.channel_id}`;

  return sendTo(recipients, {
    title: `${sender}${where}`,
    body: what,
    url: href,
    tag: `chat:${message.channel_id}`,
  });
}

/** A reaction: the message's author, if they've asked for these. */
export async function pushForReaction(messageId: string, reactorId: string, emoji: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("chat_messages")
    .select("id, channel_id, member_id, body")
    .eq("id", messageId)
    .maybeSingle();
  const message = data as { id: string; channel_id: string; member_id: string; body: string | null } | null;
  if (!message || message.member_id === reactorId) return 0;

  const [{ data: author }, { data: reactor }, { data: channelRow }] = await Promise.all([
    admin.from("members").select("id, push_reactions, status").eq("id", message.member_id).maybeSingle(),
    admin.from("members").select("full_name").eq("id", reactorId).maybeSingle(),
    admin.from("chat_channels").select("kind, slug").eq("id", message.channel_id).maybeSingle(),
  ]);
  const room = channelRow as { kind: "group" | "direct"; slug: string | null } | null;
  const a = author as { id: string; push_reactions: boolean; status: string } | null;
  if (!a || !a.push_reactions || a.status === "cancelled") return 0;

  const who = ((reactor as { full_name: string } | null)?.full_name ?? "Someone").split(" ")[0];
  const href = room?.kind === "group" ? `/sociale/${room.slug ?? message.channel_id}` : `/sociale/${message.channel_id}`;
  return sendTo([a.id], {
    title: `${who} reacted ${emoji}`,
    body: message.body ? (message.body.length > 80 ? `${message.body.slice(0, 77)}…` : message.body) : "to your message",
    url: href,
    tag: `reaction:${message.id}`,
  });
}
