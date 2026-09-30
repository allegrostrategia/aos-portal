import Link from "next/link";

import { Eyebrow } from "@/components/ui/card";
import { changeTone, formatChange, formatValue, type Unit } from "@/lib/reporting/format";
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
}: {
  label: string;
  value: number | null;
  previous: number | null;
  unit: Unit;
  goodDirection: "up" | "down" | "none";
  currency: string;
  previousLabel: string | null;
  href?: string;
}) {
  const change = monthOnMonthChange(value, previous);
  const tone = changeTone(change, goodDirection);
  const changeText = formatChange(change);

  const toneClass =
    tone === "good"
      ? "text-[#1f7a4d]"
      : tone === "bad"
        ? "text-deep-red"
        : "text-ink/55";

  const body = (
    <>
      <Eyebrow>{label}</Eyebrow>
      {/* Sized to the card, not to the page. `text-title` clamps up to 44px,
          which overflows a six-across grid the moment a figure reaches
          £24,850 — caught by looking at it rather than by any test. */}
      <p className="font-mono mt-2 text-[1.5rem] leading-tight tracking-tight text-ink tabular-nums 2xl:text-[1.75rem]">
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
