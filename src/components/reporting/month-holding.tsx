import { Card, SectionTitle } from "@/components/ui/card";

/**
 * What a retainer client sees for a month that is not out yet.
 *
 * Nina's decision 10, changed on 28 October: they used to see no such
 * month at all — the picker held the published ones, the arrows stopped
 * there, and a client wondering where October was had nothing to read.
 * Now the month is offered and this is what it says.
 *
 * **The whole screen, not a card above the report.** The page returns
 * this instead of the figures, so there is no grid of dashes underneath
 * explaining nothing. Nothing here reads a figure, which is the other
 * half of why it is its own component: the holding screen cannot leak a
 * draft because it is never handed one.
 *
 * Never shown to a member. A member fills their own report in whenever
 * they like, so "being prepared" would be a sentence about nobody.
 */
export function MonthBeingPrepared({ monthLabel }: { monthLabel: string }) {
  return (
    <Card>
      <SectionTitle>Your {monthLabel} report is being prepared</SectionTitle>
      <p className="text-body text-ink/70">
        Your strategist is still putting this month together. You&rsquo;ll be
        emailed as soon as it&rsquo;s ready to read, and your earlier months
        are all still here in the month picker.
      </p>
    </Card>
  );
}
