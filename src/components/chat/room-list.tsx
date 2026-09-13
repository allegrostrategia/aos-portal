import Link from "next/link";

import { getCurrentMember } from "@/lib/auth/member";
import {
  getChannelPreviews,
  getChannels,
  getDirectPartnerIds,
  getDirectPartners,
  getLastReads,
  resolveNames,
} from "@/lib/chat/queries";
import { getHeadshotUrls } from "@/lib/directory/queries";
import { formatSessionTimeShort } from "@/lib/time-zone";
import { Avatar } from "@/components/avatar";
import { Card, Eyebrow } from "@/components/ui/card";

/**
 * The rooms — L'Editoriale "10 Sociale": a face, a name, the last thing said,
 * how long ago, and a dot if there's something you haven't seen.
 *
 * One component for both the list screen and the desktop split view, so the
 * two never drift. It fetches its own data: it is rendered on two routes with
 * different page-level needs, and pushing the same queries through both pages'
 * props would be the drift.
 *
 * No "X online". Presence isn't tracked, so it isn't shown — the brief is
 * explicit that the reference's indicator is not being built.
 */
export async function RoomList({ current }: { current?: string }) {
  const member = (await getCurrentMember())!;
  const channels = await getChannels();
  const ids = channels.map((c) => c.id);
  const directIds = channels.filter((c) => c.kind === "direct").map((c) => c.id);

  const [partners, partnerIds, previews, reads] = await Promise.all([
    getDirectPartners(directIds, member.id),
    getDirectPartnerIds(directIds, member.id),
    getChannelPreviews(ids),
    getLastReads(),
  ]);

  const speakerIds = [...previews.values()].map((p) => p.memberId);
  const [headshots, speakerNames] = await Promise.all([
    getHeadshotUrls([...new Set([...partnerIds.values()])]),
    resolveNames(speakerIds),
  ]);

  const rows = channels.map((channel) => {
    const preview = previews.get(channel.id);
    const lastRead = reads.get(channel.id);
    const unread = Boolean(
      preview && preview.memberId !== member.id && (!lastRead || preview.createdAt > lastRead),
    );
    const name =
      channel.kind === "group"
        ? (channel.name ?? "Channel")
        : (partners.get(channel.id) ?? "A member");
    const href = channel.kind === "group" ? `/sociale/${channel.slug}` : `/sociale/${channel.id}`;
    const line = preview
      ? `${
          preview.memberId === member.id
            ? "You"
            : (speakerNames.get(preview.memberId)?.split(" ")[0] ?? "Someone")
        }: ${preview.voice ? "Voice note" : (preview.body ?? "")}`
      : (channel.description ?? "Nothing here yet");

    return { channel, name, href, unread, line, preview, partnerId: partnerIds.get(channel.id) };
  });

  // Most recent conversation first; rooms with nothing said sink.
  rows.sort((a, b) => (b.preview?.createdAt ?? "").localeCompare(a.preview?.createdAt ?? ""));

  return (
    <Card padded={false}>
      <ul className="divide-y divide-ink/6 p-2">
        {rows.map((row) => {
          const active = current === row.channel.id;
          return (
            <li key={row.channel.id}>
              <Link
                href={row.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3.5 rounded-2xl px-3 py-3 transition ${
                  active ? "bg-cream-deep" : "hover:bg-cream-deep/70"
                }`}
              >
                {row.channel.kind === "direct" ? (
                  <Avatar
                    name={row.name}
                    src={row.partnerId ? headshots.get(row.partnerId) : null}
                    size="md"
                  />
                ) : (
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-ink text-cream">
                    <span className="font-display text-heading leading-none">#</span>
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span
                      className={`truncate text-body ${row.unread ? "font-semibold" : "font-medium"} text-ink`}
                    >
                      {row.name}
                    </span>
                    {row.preview ? (
                      <span className="shrink-0 font-mono text-caption text-ink/45">
                        {formatSessionTimeShort(row.preview.createdAt).replace(/^\w+ /, "")}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`mt-0.5 block truncate text-small ${row.unread ? "text-ink/85" : "text-ink/55"}`}
                  >
                    {row.line}
                  </span>
                </span>
                {row.unread ? (
                  <span aria-label="Unread" className="size-2.5 shrink-0 rounded-full bg-orange" />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-ink/6 px-5 py-4">
        <Eyebrow>Everyone else</Eyebrow>
        <Link
          href="/sociale/directory"
          className="mt-1 block text-small text-ink underline decoration-orange decoration-2 underline-offset-4"
        >
          The member directory
        </Link>
      </div>
    </Card>
  );
}
