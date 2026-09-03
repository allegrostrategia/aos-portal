import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentMember } from "@/lib/auth/member";
import { getChannels, getDirectPartners } from "@/lib/chat/queries";
import { Card, PageHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Piazza Sociale — aOS" };

/**
 * Piazza Sociale (§10): chat and the member directory, both utilities reached
 * for constantly rather than destinations arrived at.
 *
 * The directory lives here too, for the same reason: §10 is explicit that it is
 * a searchable utility rather than a destination, so burying it in a themed
 * station would add friction without adding feeling.
 */
export default async function SocialePage() {
  const member = (await getCurrentMember())!;
  const channels = await getChannels();

  const groups = channels.filter((c) => c.kind === "group");
  const directs = channels.filter((c) => c.kind === "direct");
  const partners = await getDirectPartners(
    directs.map((c) => c.id),
    member.id,
  );

  return (
    <main className="flex-1 py-8 sm:py-10">
      <PageHeader
        eyebrow="Piazza Sociale"
        title="The room next door"
        intro="Where everyone else is. Type or talk — a voice note often says in twenty seconds what a paragraph doesn't."
      />

      <ul className="flex flex-col gap-3">
        {groups.map((channel) => (
          <li key={channel.id}>
            <Link href={`/sociale/${channel.slug}`} className="block">
              <Card className="transition hover:border-navy/30">
                <p className="font-display text-heading text-navy italic">
                  {channel.name}
                </p>
                {channel.description ? (
                  <p className="mt-1 text-small text-navy/70">
                    {channel.description}
                  </p>
                ) : null}
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      {directs.length > 0 ? (
        <>
          <h2 className="font-display mt-8 mb-3 text-heading text-navy italic">
            Direct messages
          </h2>
          <ul className="flex flex-col gap-2">
            {directs.map((channel) => (
              <li key={channel.id}>
                <Link href={`/sociale/${channel.id}`} className="block">
                  <Card className="transition hover:border-navy/30">
                    <p className="text-body text-navy">
                      {partners.get(channel.id) ?? "A member"}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2 className="font-display mt-8 mb-3 text-heading text-navy italic">
        Everyone else
      </h2>
      <Link href="/sociale/directory" className="block">
        <Card className="transition hover:border-navy/30">
          <p className="text-body text-navy">The member directory</p>
          <p className="mt-1 text-small text-navy/70">
            Search by name, what someone does, or anything in their bio — then
            message them straight from their listing.
          </p>
        </Card>
      </Link>
    </main>
  );
}
