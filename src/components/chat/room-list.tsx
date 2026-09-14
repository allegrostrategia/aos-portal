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
export type RoomRow = {
  id: string;
  kind: "group" | "direct";
  name: string;
  href: string;
  unread: boolean;
  line: string;
  createdAt: string | null;
  headshotUrl: string | null;
};

/** The rows both renderings share, most recent conversation first. */
export async function getRoomRows(): Promise<RoomRow[]> {
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

  // Most recent conversation first; rooms with nothing said sink. General
  // stays at the top regardless: it is where Sociale opens (C4).
  rows.sort((a, b) => {
    if (a.channel.slug === "general") return -1;
    if (b.channel.slug === "general") return 1;
    return (b.preview?.createdAt ?? "").localeCompare(a.preview?.createdAt ?? "");
  });

  return rows.map((row) => ({
    id: row.channel.id,
    kind: row.channel.kind,
    name: row.name,
    href: row.href,
    unread: row.unread,
    line: row.line,
    createdAt: row.preview?.createdAt ?? null,
    headshotUrl: row.partnerId ? (headshots.get(row.partnerId) ?? null) : null,
  }));
}

export async function RoomList({ current }: { current?: string }) {
  const rows = await getRoomRows();

  return (
    <Card padded={false}>
      <ul className="divide-y divide-ink/6 p-2">
        {rows.map((row) => {
          const active = current === row.id;
          return (
            <li key={row.id}>
              <Link
                href={row.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3.5 rounded-2xl px-3 py-3 transition ${
                  active ? "bg-cream-deep" : "hover:bg-cream-deep/70"
                }`}
              >
                {row.kind === "direct" ? (
                  <Avatar name={row.name} src={row.headshotUrl} size="md" />
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
                    {row.createdAt ? (
                      <span className="shrink-0 font-mono text-caption text-ink/45">
                        {formatSessionTimeShort(row.createdAt).replace(/^\w+ /, "")}
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

/**
 * The rooms as a strip of chips across the top of a thread. Phones only:
 * Sociale opens on General and this is how the other conversations are
 * reached without going back to a list first (round-2 brief, C4). Scrolls
 * sideways; the current room is the dark chip.
 */
export async function RoomChips({ current }: { current: string }) {
  const rows = await getRoomRows();

  return (
    <nav aria-label="Rooms" className="-mx-5 overflow-x-auto px-5 lg:hidden">
      <ul className="flex w-max gap-2 pb-1">
        {rows.map((row) => {
          const active = row.id === current;
          return (
            <li key={row.id}>
              <Link
                href={row.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-small font-medium whitespace-nowrap transition ${
                  active ? "bg-ink text-cream" : "bg-cream-deep text-ink/75 hover:text-ink"
                }`}
              >
                {row.kind === "direct" ? (
                  <Avatar name={row.name} src={row.headshotUrl} size="sm" className="-ml-2 size-6 text-[0.6rem] ring-0" />
                ) : (
                  <span aria-hidden className="font-display text-body leading-none">#</span>
                )}
                {row.name}
                {row.unread && !active ? (
                  <span aria-label="Unread" className="size-2 rounded-full bg-orange" />
                ) : null}
              </Link>
            </li>
          );
        })}
        <li>
          <Link
            href="/sociale/directory"
            className="inline-flex items-center rounded-full px-3.5 py-1.5 text-small font-medium whitespace-nowrap text-ink/60 hover:text-ink"
          >
            Everyone
          </Link>
        </li>
      </ul>
    </nav>
  );
}
