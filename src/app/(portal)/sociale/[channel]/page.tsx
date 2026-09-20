import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCurrentMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import {
  getChannel,
  getCoachIds,
  getDirectPartners,
  getMessages,
  getPins,
  getReactions,
} from "@/lib/chat/queries";
import { deleteMessage, setPinned } from "@/lib/chat/actions";
import { getHeadshotUrls } from "@/lib/directory/queries";
import { formatSessionTime, formatSessionTimeShort } from "@/lib/time-zone";
import { windowState } from "@/lib/chat/window";
import { Avatar } from "@/components/avatar";
import { RoomChips, RoomList, RoomMenu } from "@/components/chat/room-list";
import Link from "next/link";
import { Card, Eyebrow } from "@/components/ui/card";
import { Composer } from "./composer";
import { LiveThread } from "./live-thread";
import { Reactions } from "./reactions";
import { ThreadScroll } from "./thread-scroll";

export const metadata: Metadata = { title: "Piazza Sociale · aOS" };

/**
 * A room. L'Editoriale "10": bubbles, faces, reactions.
 *
 * Sent and received differ in side and in surface — yours are ink on the
 * right, everyone else's are cream-deep on the left with their headshot — so
 * the thread reads at a glance without reading the names. Names still appear
 * on received messages in a group, because a face alone doesn't name a
 * newcomer.
 *
 * On desktop the room list stays alongside. On a phone the rooms are a strip
 * of chips above the thread, so switching is one tap and Sociale never lands
 * on an empty state.
 *
 * The room fills the screen and does not scroll as a page (Dom, 20 Sep): the
 * chips, title and composer stay put, and only the thread scrolls, in its own
 * box, opening at the newest message. `data-chat-screen` on <main> is what
 * globals.css keys on to pin the document; everything from there down to the
 * thread is `min-h-0` so the flex chain can shrink rather than grow.
 */
export default async function ChannelPage({
  params,
}: PageProps<"/sociale/[channel]">) {
  const member = (await getCurrentMember())!;
  const { channel: handle } = await params;

  // RLS decides whether this channel exists for them, so a direct channel
  // somebody isn't in is a 404 rather than a refusal.
  const channel = await getChannel(handle);
  if (!channel) notFound();

  const [messages, partners, { data: buildRows }] = await Promise.all([
    getMessages(channel.id),
    channel.kind === "direct"
      ? getDirectPartners([channel.id], member.id)
      : Promise.resolve(new Map<string, string>()),
    (await createClient())
      .from("handover_pack")
      .select("id, title")
      .eq("member_id", member.id)
      .order("created_at", { ascending: false }),
  ]);

  const [reactions, headshots, pins, coaches] = await Promise.all([
    getReactions(messages.map((m) => m.id), member.id),
    getHeadshotUrls([...new Set(messages.map((m) => m.member_id))]),
    getPins(channel.id),
    getCoachIds(),
  ]);
  const pinnedIds = new Set(pins.map((p) => p.id));
  const isAdmin = member.role === "admin";

  // A timed room (round 3, §A): readable always, writable in its window.
  // Admins post whenever; members see the lock and when it lifts.
  const window = windowState(channel);
  const lockedForMe = window.kind === "closed" && !isAdmin;

  const title =
    channel.kind === "group"
      ? (channel.name ?? "Channel")
      : (partners.get(channel.id) ?? "Direct message");

  return (
    <main data-chat-screen className="flex min-h-0 flex-1 flex-col py-4 sm:py-6">
      <div className="grid min-h-0 min-w-0 flex-1 gap-5 lg:grid-cols-[22rem_1fr]">
        <div className="hidden min-h-0 overflow-y-auto lg:block">
          <RoomList current={channel.id} />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Phones: the rooms as chips across the top, General first (C4).
              Laptops: the list is the column to the left. */}
          <div className="mb-3">
            <RoomChips current={channel.id} />
          </div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h1 className="font-display min-w-0 truncate text-title font-medium text-ink">{title}</h1>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href="/sociale/search"
                className="text-small text-ink/60 underline underline-offset-4 hover:text-ink"
              >
                Search
              </Link>
              <RoomMenu current={channel.id} memberId={member.id} />
            </div>
          </div>

          {/* Pinned, at the top (round 2, E1). Admin pins; anyone in the room
              sees it; only an admin takes it down. */}
          {pins.length > 0 ? (
            <Card className="mb-3 border-orange/40 bg-lemon/25" padded={false}>
              <ul className="divide-y divide-ink/8">
                {pins.map((pin) => (
                  <li key={pin.id} className="flex items-start gap-3 px-4 py-3">
                    <span aria-hidden className="mt-0.5 text-orange">📌</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-caption font-medium text-ink/60">
                        {coaches.has(pin.member_id) ? "Nina" : pin.authorName}
                      </p>
                      {pin.body ? (
                        <p className="text-small break-words whitespace-pre-wrap text-ink">{pin.body}</p>
                      ) : pin.image_path ? (
                        <p className="text-small text-ink/70">A picture</p>
                      ) : (
                        <p className="text-small text-ink/70">A voice note</p>
                      )}
                    </div>
                    {isAdmin ? (
                      <form action={setPinned}>
                        <input type="hidden" name="message_id" value={pin.id} />
                        <input type="hidden" name="channel_id" value={handle} />
                        <input type="hidden" name="pinned" value="false" />
                        <button type="submit" className="text-caption text-ink/50 underline underline-offset-4 hover:text-ink">
                          Unpin
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <LiveThread channelId={channel.id} />

          <Card padded={false} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ThreadScroll
              count={messages.length}
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto p-4"
            >
              {messages.length === 0 ? (
                <p className="text-small text-ink/60">
                  Nothing here yet. Someone has to go first.
                </p>
              ) : (
                messages.map((message) => {
                  const mine = message.member_id === member.id;

                  // Every received message carries its sender's face and
                  // name, in every kind of room (round 4, item 17). Your own
                  // carry neither, as in WhatsApp (Dom, 18 Sep): they're on
                  // the right and in ink, which is how you know they're yours.
                  return (
                    <div
                      key={message.id}
                      className={`flex items-end gap-2.5 ${mine ? "flex-row-reverse" : ""}`}
                    >
                      {!mine ? (
                        <span className="w-9 shrink-0">
                          <Avatar
                            name={message.authorName}
                            src={headshots.get(message.member_id)}
                            size="sm"
                          />
                        </span>
                      ) : null}

                      <div className={`flex min-w-0 max-w-[82%] flex-col ${mine ? "items-end" : "items-start"}`}>
                        {!mine ? (
                          <p className="mb-1 ml-1 flex items-center gap-1.5 text-caption font-medium text-ink/60">
                            {message.authorName}
                            {/* Nina's messages read as the coach's, not a
                                peer's (round 2, E5). */}
                            {coaches.has(message.member_id) ? (
                              <span className="rounded-full bg-orange px-1.5 py-px text-[0.6rem] font-semibold tracking-wide text-ink uppercase">
                                Coach
                              </span>
                            ) : null}
                          </p>
                        ) : null}

                        <div
                          className={`rounded-2xl px-3.5 py-2.5 ${
                            mine
                              ? "rounded-br-md bg-ink text-cream"
                              : coaches.has(message.member_id)
                                ? "rounded-bl-md border border-orange/50 bg-lemon/40 text-ink"
                                : "rounded-bl-md bg-cream-deep text-ink"
                          }`}
                        >
                          {message.image_path ? (
                            // Through the API, which checks the reader may see
                            // the message before signing. Never a public URL.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/api/chat-image/${message.id}`}
                              alt=""
                              loading="lazy"
                              className={`max-h-80 w-auto max-w-full rounded-xl ${message.body ? "mb-2" : ""}`}
                            />
                          ) : null}
                          {message.body ? (
                            <p className="text-body break-words whitespace-pre-wrap">{message.body}</p>
                          ) : null}

                          {message.voice_path ? (
                            <div className={message.body ? "mt-2" : ""}>
                              {/* Served through /api/voice/[id], which checks this
                                  member may see the message before signing a URL. */}
                              <audio
                                controls
                                preload="none"
                                src={`/api/voice/${message.id}`}
                                className="h-9 w-56 max-w-full"
                              />
                              {message.voice_seconds ? (
                                <p className={`font-mono text-caption ${mine ? "text-cream/60" : "text-ink/45"}`}>
                                  {message.voice_seconds}s
                                </p>
                              ) : null}
                            </div>
                          ) : null}

                          {message.handover_pack_id ? (
                            <p className="mt-1.5">
                              <Eyebrow tone={mine ? "light" : "muted"}>About one of their builds</Eyebrow>
                            </p>
                          ) : null}
                        </div>

                        <p className={`mt-1 flex items-center gap-2 font-mono text-[0.65rem] text-ink/40 ${mine ? "mr-1 flex-row-reverse" : "ml-1"}`}>
                          <span>{formatSessionTimeShort(message.created_at)}</span>
                          {/* Retract (E4): your own, or anything as an admin.
                              Pin (E1): admin only. Both are plain forms. */}
                          {mine || isAdmin ? (
                            <form action={deleteMessage}>
                              <input type="hidden" name="message_id" value={message.id} />
                              <input type="hidden" name="channel_id" value={handle} />
                              <button type="submit" className="font-sans underline underline-offset-2 hover:text-ink">
                                Delete
                              </button>
                            </form>
                          ) : null}
                          {isAdmin && channel.kind === "group" ? (
                            <form action={setPinned}>
                              <input type="hidden" name="message_id" value={message.id} />
                              <input type="hidden" name="channel_id" value={handle} />
                              <input type="hidden" name="pinned" value={pinnedIds.has(message.id) ? "false" : "true"} />
                              <button type="submit" className="font-sans underline underline-offset-2 hover:text-ink">
                                {pinnedIds.has(message.id) ? "Unpin" : "Pin"}
                              </button>
                            </form>
                          ) : null}
                        </p>

                        <Reactions
                          messageId={message.id}
                          initial={reactions.get(message.id) ?? []}
                          mine={mine}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </ThreadScroll>

            {lockedForMe && window.kind === "closed" ? (
              <div className="border-t border-ink/10 bg-cream-deep px-4 py-4">
                <Eyebrow>Closed until {formatSessionTimeShort(window.opensAt)}</Eyebrow>
                <p className="mt-1 text-small text-ink/80">
                  This room opens on Mondays, 2:00 to 3:30pm, for your check-in
                  and Nina&rsquo;s reply. You can read it any time. Next:{" "}
                  {formatSessionTime(window.opensAt)}.
                </p>
              </div>
            ) : (
              <>
                {window.kind === "open" ? (
                  <p className="border-t border-ink/10 bg-lemon/25 px-4 py-2 text-caption text-ink/70">
                    Open now, until {formatSessionTimeShort(window.closesAt)}.
                  </p>
                ) : null}
                {isAdmin && window.kind === "closed" ? (
                  <p className="border-t border-ink/10 bg-lemon/25 px-4 py-2 text-caption text-ink/70">
                    Closed to members until {formatSessionTimeShort(window.opensAt)}. You can post.
                  </p>
                ) : null}
                <Composer
                  channelId={channel.id}
                  builds={(buildRows ?? []) as { id: string; title: string }[]}
                />
              </>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
