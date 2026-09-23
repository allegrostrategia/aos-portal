import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";

import { requireMember } from "@/lib/auth/member";
import { getMyRecap } from "@/lib/recap/queries";
import { markRecapOpened } from "@/lib/recap/mark";
import { isRecapMonth } from "@/lib/recap/month";
import { RECAP_COPY } from "@/lib/recap/copy";
import { formatSessionTimeShort } from "@/lib/time-zone";
import { Card, Eyebrow, PageHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Your monthly review · aOS" };

/**
 * One month's recap, as the member reads it (brief §3, §4).
 *
 * Nina's writing and nothing else — no stats strip, no charts. The numbers are
 * already in the writing because she wrote it from them, and repeating them
 * around the edges would turn a letter into a dashboard.
 *
 * Reading it is what marks it read: `after()`, so the update happens once the
 * page is on its way rather than blocking it, and once only. The card on
 * Piazza goes when this lands.
 */
export default async function RecapPage({ params }: PageProps<"/reviews/[month]">) {
  const member = await requireMember();
  const { month: segment } = await params;

  const month = `${segment.slice(0, 7)}-01`;
  if (!isRecapMonth(month)) notFound();

  // RLS and the query both refuse an unsent one, so a guessed URL finds
  // nothing rather than a draft about themselves.
  const recap = await getMyRecap(member.id, month);
  if (!recap) notFound();

  if (!recap.openedAt) after(() => markRecapOpened(member.id, month));

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 py-6 sm:py-10">
      <p className="mb-4">
        <Link
          href="/you"
          className="text-small text-ink/70 underline underline-offset-4 transition hover:text-ink"
        >
          ← {RECAP_COPY.page.backToArchive}
        </Link>
      </p>

      <PageHeader
        eyebrow={RECAP_COPY.archiveTitle}
        title={RECAP_COPY.page.title(recap.month)}
        intro={RECAP_COPY.page.intro}
      />

      <Card>
        <p className="text-body leading-relaxed whitespace-pre-wrap text-ink">{recap.body}</p>
      </Card>

      <Eyebrow className="mt-4 block">Sent {formatSessionTimeShort(recap.sentAt)}</Eyebrow>
    </main>
  );
}
