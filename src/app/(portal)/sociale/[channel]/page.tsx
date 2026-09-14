import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCurrentMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import {
  getChannel,
  getDirectPartners,
  getMessages,
  getReactions,
} from "@/lib/chat/queries";
import { getHeadshotUrls } from "@/lib/directory/queries";
import { formatSessionTimeShort } from "@/lib/time-zone";
import { Avatar } from "@/components/avatar";
import { RoomChips, RoomList } from "@/components/chat/room-list";
import { Card, Eyebrow } from "@/components/ui/card";
import { Composer } from "./composer";
import { LiveThread } from "./live-thread";
import { Reactions } from "./reactions";

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

  const [reactions, headshots] = await Promise.all([
    getReactions(messages.map((m) => m.id), member.id),
    getHeadshotUrls([...new Set(messages.map((m) => m.member_id))]),
  ]);

  const title =
    channel.kind === "group"
      ? (channel.name ?? "Channel")
      : (partners.get(channel.id) ?? "Direct message");

  return (
    <main className="flex flex-1 flex-col py-4 sm:py-10">
      <div className="grid min-w-0 flex-1 gap-5 lg:grid-cols-[22rem_1fr]">
        <div className="hidden lg:block">
          <RoomList current={channel.id} />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Phones: the rooms as chips across the top, General first (C4).
              Laptops: the list is the column to the left. */}
          <div className="mb-3">
            <RoomChips current={channel.id} />
          </div>
          <h1 className="font-display mb-3 text-title font-medium text-ink">{title}</h1>

          <LiveThread channelId={channel.id} />

          <Card padded={false} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex flex-col gap-3 overflow-x-hidden overflow-y-auto p-4">
              {messages.length === 0 ? (
                <p className="text-small text-ink/60">
                  Nothing here yet. Someone has to go first.
                </p>
              ) : (
                messages.map((message, i) => {
                  const mine = message.member_id === member.id;
                  const prev = messages[i - 1];
                  // Consecutive messages from one person share a face and a name.
                  const continues = prev?.member_id === message.member_id;

                  return (
                    <div
                      key={message.id}
                      className={`flex items-end gap-2.5 ${mine ? "flex-row-reverse" : ""} ${continues ? "-mt-1.5" : ""}`}
                    >
                      {!mine ? (
                        <span className={`w-9 shrink-0 ${continues ? "invisible" : ""}`}>
                          <Avatar
                            name={message.authorName}
                            src={headshots.get(message.member_id)}
                            size="sm"
                          />
                        </span>
                      ) : null}

                      <div className={`flex min-w-0 max-w-[82%] flex-col ${mine ? "items-end" : "items-start"}`}>
                        {!mine && !continues && channel.kind === "group" ? (
                          <p className="mb-1 ml-1 text-caption font-medium text-ink/60">
                            {message.authorName}
                          </p>
                        ) : null}

                        <div
                          className={`rounded-2xl px-3.5 py-2.5 ${
                            mine
                              ? "rounded-br-md bg-ink text-cream"
                              : "rounded-bl-md bg-cream-deep text-ink"
                          }`}
                        >
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

                        <p className={`mt-1 font-mono text-[0.65rem] text-ink/40 ${mine ? "mr-1" : "ml-1"}`}>
                          {formatSessionTimeShort(message.created_at)}
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
            </div>

            <Composer
              channelId={channel.id}
              builds={(buildRows ?? []) as { id: string; title: string }[]}
            />
          </Card>
        </div>
      </div>
    </main>
  );
}
