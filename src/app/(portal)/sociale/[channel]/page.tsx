import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { getChannel, getDirectPartners, getMessages } from "@/lib/chat/queries";
import { formatSessionTimeShort } from "@/lib/time-zone";
import { Card, Eyebrow } from "@/components/ui/card";
import { Composer } from "./composer";
import { LiveThread } from "./live-thread";

export const metadata: Metadata = { title: "Piazza Sociale — aOS" };

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

  const title =
    channel.kind === "group"
      ? (channel.name ?? "Channel")
      : (partners.get(channel.id) ?? "Direct message");

  return (
    <main className="flex flex-1 flex-col py-8 sm:py-10">
      <p className="mb-4">
        <Link
          href="/sociale"
          className="text-small text-navy/70 underline underline-offset-4 transition hover:text-navy"
        >
          ← Piazza Sociale
        </Link>
      </p>

      <h1 className="font-display mb-4 text-title text-navy italic">{title}</h1>

      <LiveThread channelId={channel.id} />

      <Card padded={false} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <p className="text-small text-navy/60">
              Nothing here yet. Someone has to go first.
            </p>
          ) : (
            messages.map((message) => {
              const mine = message.member_id === member.id;
              return (
                <div key={message.id} className={mine ? "sm:pl-10" : "sm:pr-10"}>
                  <div className="flex items-baseline gap-2">
                    <p className="text-small font-medium text-navy">
                      {mine ? "You" : message.authorName}
                    </p>
                    <p className="font-mono text-caption text-navy/40">
                      {formatSessionTimeShort(message.created_at)}
                    </p>
                  </div>

                  {message.body ? (
                    <p className="mt-1 text-body whitespace-pre-wrap text-navy/85">
                      {message.body}
                    </p>
                  ) : null}

                  {message.voice_path ? (
                    <div className="mt-2">
                      {/* Served through /api/voice/[id], which checks this
                          member may see the message before signing a URL. */}
                      <audio
                        controls
                        preload="none"
                        src={`/api/voice/${message.id}`}
                        className="h-9 w-full max-w-sm"
                      />
                      {message.voice_seconds ? (
                        <p className="font-mono text-caption text-navy/40">
                          {message.voice_seconds}s
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {message.handover_pack_id ? (
                    <p className="mt-1">
                      <Eyebrow>About one of their builds</Eyebrow>
                    </p>
                  ) : null}
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
    </main>
  );
}
