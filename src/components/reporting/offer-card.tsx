import { Card } from "@/components/ui/card";
import { IconCircle, type IconTone } from "./icons";
import { formatValue } from "@/lib/reporting/format";
import type { Figure } from "@/lib/reporting/formulas";

/**
 * One offer, as a card (§5.9 and the approved Offers mockup).
 *
 * **A card each rather than a row each.** The table this replaces was
 * accurate and asked the reader to do the comparison themselves: six
 * columns of figures, one of which — margin — is the one the page is
 * actually about. The mockup gives each offer its headline price, what it
 * sold, and a ring for the margin, which puts the thing being judged at
 * the size it deserves. The figures are the same figures, read from the
 * same `calculateOffer`.
 *
 * **Decorative, all of it.** The ring repeats the percentage printed
 * inside it, the disc repeats the pill beside the name, and the pill
 * repeats what the price line already says. Nothing here is carried by
 * colour or by shape alone.
 */

/**
 * The two colours a margin ring is drawn in.
 *
 * **Green unless the offer is below the hourly-rate target** (Nina,
 * 30 October). Not the brand orange and not a red: `#e56135` is the ink
 * the sparklines already use, because a 6px stroke on a white card owes
 * the reader 3:1 and brand orange is 2.93 — the same reason the line
 * palette exists at all. `#1f7a4d` is the green the report already has in
 * `CHANGE_TONE_CLASS` and `TARGET_TONE_FILL`, not a new one.
 *
 * Checked rather than judged, both surfaces:
 *
 *   node scripts/check-chart-palette.mjs "green,orange-ink" white --lines
 *
 * white 5.32 / 3.45 · cream 4.78 / 3.10 · the pair separates by 23.3 under
 * deuteranopia and protanopia, well over the floor of 8. Green against a
 * RED would have been the one pair most colourblind readers cannot split;
 * against this orange it is not close.
 *
 * **And it is never colour alone anyway.** The percentage is printed
 * inside the ring, and the orange case always carries the sentence
 * underneath saying what the offer is below and by how much.
 */
const MARGIN_OK = "#1f7a4d";
const MARGIN_BELOW = "#e56135";

/** The margin ring: one number against a hundred, as a stroked circle. */
function MarginRing({
  percent,
  belowTarget,
}: {
  percent: number | null;
  /** Below the hourly-rate target — the ring's only reason to go orange. */
  belowTarget: boolean;
}) {
  // **A 0–100 number, not a proportion.** `percentage()` in formulas.ts
  // returns 87 for 87%, and `formatValue(x, "percent")` prints it as it
  // stands — so the first version's `percent * 100` drew "8700%". Caught
  // in the browser; the unit test below it now says which scale this is.
  //
  // A margin can also be negative — an offer costing more to deliver than
  // it earns — and a ring cannot draw that, so it draws empty and the
  // figure inside says what happened.
  const shown = percent === null ? 0 : Math.max(0, Math.min(percent, 100));
  const radius = 26;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg
      viewBox="0 0 64 64"
      className="size-16 shrink-0"
      role="img"
      aria-label={
        percent === null
          ? "Margin not worked out"
          : `Margin ${formatValue(percent, "percent")}`
      }
    >
      <circle
        cx="32"
        cy="32"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        className="text-ink/10"
      />
      {percent === null ? null : (
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          stroke={belowTarget ? MARGIN_BELOW : MARGIN_OK}
          strokeDasharray={`${(shown / 100) * circumference} ${circumference}`}
          // Twelve o'clock, where a reader's eye starts on a dial — the
          // same as the launch card's goal ring, so the two read alike.
          transform="rotate(-90 32 32)"
        />
      )}
      <text x="32" y="36" textAnchor="middle" className="fill-ink font-mono text-[0.85rem]">
        {percent === null ? "—" : `${Math.round(percent)}%`}
      </text>
    </svg>
  );
}

export function OfferCard({
  name,
  pricingModel,
  price,
  unitsSold,
  revenue,
  hoursSpent,
  margin,
  hourlyRate,
  targetHourlyRate,
  currency,
  tone,
}: {
  name: string;
  pricingModel: "one_off" | "recurring" | undefined;
  price: number | null;
  /** `Figure`, because an offer row's typed figures may be undefined. */
  unitsSold: Figure;
  revenue: Figure;
  hoursSpent: Figure;
  /** A 0–100 number, as `offers_margin` gives it — 58, not 0.58. */
  margin: number | null;
  hourlyRate: number | null;
  /** The workspace's own target, or null where none is set. */
  targetHourlyRate: number | null;
  currency: string;
  tone: IconTone;
}) {
  const recurring = pricingModel === "recurring";
  // The mockup warns on a margin target. There is no margin target in the
  // schema — `report_workspaces` has `target_hourly_rate` and nothing else
  // — so the warning is drawn against the target that exists, which is
  // also the one the bar chart below the cards is measured against. A
  // margin target would be a migration and Nina's decision, not an
  // invention here.
  const belowTarget =
    targetHourlyRate !== null && hourlyRate !== null && hourlyRate < targetHourlyRate;

  return (
    <Card className="flex h-full flex-col gap-4">
      <div className="flex items-start gap-3">
        {/* Members or one sale: the glyph says which, and so does the pill
            underneath it. */}
        <IconCircle name={recurring ? "people" : "offers"} tone={tone} />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-heading font-medium text-ink">{name}</h3>
          <p className="mt-1.5">
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-caption font-medium ${
                recurring ? "bg-blush/45 text-ink" : "bg-sky/45 text-ink"
              }`}
            >
              {recurring ? "Recurring" : "One-off"}
            </span>
          </p>
        </div>
      </div>

      {/* The price as it is sold, not as it is summed: "£250 / month" is
          what the client charges, and £250 on its own would read as what
          the offer earned. */}
      <p className="font-display text-title leading-none font-medium text-ink lining-nums proportional-nums">
        {formatValue(price, "currency", currency)}
        {recurring ? <span className="text-heading text-ink/55"> / month</span> : null}
      </p>

      <dl className="flex flex-wrap gap-x-6 gap-y-2 border-t border-ink/8 pt-4">
        <div>
          {/* §5.9: a recurring offer's units are members. */}
          <dt className="text-caption uppercase tracking-wide text-ink/55">
            {recurring ? "Members" : "Units sold"}
          </dt>
          <dd className="font-mono text-body text-ink">
            {formatValue(unitsSold ?? null, "count")}
          </dd>
        </div>
        <div>
          <dt className="text-caption uppercase tracking-wide text-ink/55">Revenue</dt>
          <dd className="font-mono text-body text-ink">
            {formatValue(revenue ?? null, "currency", currency)}
          </dd>
        </div>
      </dl>

      <div className="mt-auto flex items-end justify-between gap-4 border-t border-ink/8 pt-4">
        {/* The label under the ring, as the mockup draws it: beside it,
            the three labels along the bottom of the card ran into each
            other at three cards across. */}
        <div className="flex flex-col items-center gap-1">
          <MarginRing percent={margin} belowTarget={belowTarget} />
          <span className="text-caption uppercase tracking-wide text-ink/55">Margin</span>
        </div>
        <dl className="flex flex-wrap justify-end gap-x-5 gap-y-2 text-right">
          <div>
            <dt className="text-caption uppercase tracking-wide text-ink/55">Hours</dt>
            <dd className="font-mono text-body text-ink">
              {formatValue(hoursSpent ?? null, "hours")}
            </dd>
          </div>
          <div>
            <dt className="text-caption uppercase tracking-wide text-ink/55">Hourly rate</dt>
            <dd className="font-mono text-body text-ink">
              {formatValue(hourlyRate, "currency", currency)}
            </dd>
          </div>
        </dl>
      </div>

      {belowTarget ? (
        // In words and with a figure, not as a red edge round the card: a
        // reader who cannot see the colour still has the sentence, and the
        // sentence says what it is below rather than only that it is.
        <p className="flex items-start gap-2 rounded-xl bg-orange/12 px-3 py-2 text-caption text-ink">
          <span aria-hidden="true">⚠</span>
          <span>
            Below your {formatValue(targetHourlyRate, "currency", currency)} an hour target
          </span>
        </p>
      ) : null}
    </Card>
  );
}
