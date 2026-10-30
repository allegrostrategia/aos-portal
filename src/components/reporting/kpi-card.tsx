import Link from "next/link";

import { IconCircle, type IconTone, type ReportIconName } from "./icons";
import {
  CHANGE_TONE_CLASS,
  changeTone,
  formatChange,
  formatValue,
  type Unit,
} from "@/lib/reporting/format";
import { monthOnMonthChange } from "@/lib/reporting/formulas";

/**
 * The KPI card of §3's pattern list: label, big number, month-on-month change
 * with an arrow, and the month it is compared against.
 *
 * No sparkline yet. The mockup draws one on every card and it needs twelve
 * months of history per metric — a real query and a real chart, which is
 * Stage 3's work alongside the other charts. A card without one still says
 * the thing the card is for.
 *
 * The arrow's colour comes from the metric's own direction, never from the
 * sign: a fall in costs is good news, and a report that congratulates
 * somebody on their costs rising is worse than one with no colour at all.
 */
export function KpiCard({
  label,
  value,
  previous,
  unit,
  goodDirection,
  currency,
  previousLabel,
  href,
  light,
  icon,
}: {
  label: string;
  value: number | null;
  previous: number | null;
  unit: Unit;
  goodDirection: "up" | "down" | "none";
  currency: string;
  previousLabel: string | null;
  href?: string;
  /**
   * §7's traffic light, worked out by `trafficLight()` against a target,
   * a benchmark or last month — in that order, using the first one the
   * client actually has.
   *
   * **Never colour alone.** The dot carries a word with it, because a
   * red and a green dot are the pair most colourblind readers cannot
   * separate, and because a dot on its own says nothing about what it
   * was measured against.
   */
  light?: { tone: "green" | "amber" | "red"; against: string } | null;
  /**
   * The mockups' tinted disc beside the label. Decorative — it repeats the
   * label, which is right there in words — so a card without one says
   * everything a card with one says.
   */
  icon?: { name: ReportIconName; tone: IconTone };
}) {
  const change = monthOnMonthChange(value, previous);
  const tone = changeTone(change, goodDirection);
  const changeText = formatChange(change);

  const toneClass = CHANGE_TONE_CLASS[tone ?? "neutral"];

  // Colour plus a word, always. The dot alone would be the one pair a
  // colourblind reader cannot separate, and it would not say what the
  // figure was measured against either.
  const lightWord =
    light?.tone === "green"
      ? "On track"
      : light?.tone === "amber"
        ? "Close"
        : light?.tone === "red"
          ? "Off track"
          : null;
  const lightColour =
    light?.tone === "green"
      ? "#1f7a4d"
      : light?.tone === "amber"
        ? "var(--aos-orange)"
        : "var(--aos-deep-red)";

  const body = (
    <>
      {/* The label in sentence case beside the disc, not a tracked small-cap
          eyebrow (Nina, 30 Oct). The mockups read "Revenue", and at this
          size the eyebrow treatment was competing with the figure under
          it rather than introducing it. */}
      {icon ? (
        <div className="flex items-center gap-3">
          <IconCircle name={icon.name} tone={icon.tone} size="sm" />
          <span className="text-small font-medium text-ink/75">{label}</span>
        </div>
      ) : (
        <span className="block text-small font-medium text-ink/75">{label}</span>
      )}
      {/* **The display serif, not the mono.** CLAUDE.md gives Cormorant
          "headings and display values" and reserves the mono for numbers
          in running data — a table column, a date beside a label. A
          headline figure on a card is a display value, and it is what the
          mockups draw.
          Sized to the card, not to the page. `text-title` clamps up to
          44px, which overflows a six-across grid the moment a figure
          reaches £24,850 — caught by looking at it, not by a test. */}
      {/* **No `tabular-nums` here**, which the mono version had and needed.
          Tabular figures exist to make columns line up; a headline figure
          is not in a column, and Cormorant's tabular "1" is a bare serifed
          stem — "184,500" read as "I84,500" on the first pass. The
          proportional figures are the ones the face was drawn with. */}
      <p className="font-display mt-2 text-[2rem] leading-tight font-medium text-ink 2xl:text-[2.25rem]">
        {formatValue(value, unit, currency)}
      </p>
      {changeText && previousLabel ? (
        <p className="mt-2 flex items-baseline gap-2 text-small">
          <span className={`font-medium ${toneClass}`}>{changeText}</span>
          <span className="text-ink/45">vs. {previousLabel}</span>
        </p>
      ) : (
        <p className="mt-2 text-small text-ink/40">No month to compare</p>
      )}
      {/* Each phrase wraps as a whole or not at all: six cards across,
          "On track" broke over two lines and "vs. last month" over two
          more. Seen on the rendered card, not in the markup. */}
      {light && lightWord ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-caption text-ink/60">
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: lightColour }}
            />
            {lightWord}
          </span>
          <span className="whitespace-nowrap text-ink/45">vs. {light.against}</span>
        </p>
      ) : null}
    </>
  );

  const shell =
    "block rounded-card border border-ink/8 bg-card p-5 shadow-soft transition";

  return href ? (
    <Link href={href} className={`${shell} hover:border-ink/20`}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}
