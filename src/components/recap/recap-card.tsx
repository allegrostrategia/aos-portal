import { RECAP_COPY, type RecapStats } from "@/lib/recap/copy";
import { Card, Eyebrow } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

/**
 * "Your monthly review is here" — the Piazza card, while it's unread.
 *
 * Its own component rather than more JSX on an already long Piazza: this is
 * the one surface whose wording is Nina's to change, and a component that
 * reads every word from RECAP_COPY is easier to hand over than a block buried
 * three hundred lines into a page.
 */
export function RecapCard({ month, stats }: { month: string; stats: RecapStats | null }) {
  return (
    <Card tone="dark" className="mt-8">
      <Eyebrow tone="light">{RECAP_COPY.card.eyebrow(month)}</Eyebrow>
      <p className="font-display mt-2 text-title font-medium text-cream">
        {RECAP_COPY.card.title}
      </p>
      <p className="mt-2 text-small text-cream/75">{RECAP_COPY.card.body(stats)}</p>
      <div className="mt-5">
        <ButtonLink href={`/reviews/${month.slice(0, 7)}`} size="sm">
          {RECAP_COPY.card.button}
        </ButtonLink>
      </div>
    </Card>
  );
}
