import { CHART_HUE } from "@/lib/log/palette";
import type { CategoryTotal } from "@/lib/log/queries";
import { formatMinutes } from "@/lib/timer/format";
import { addDays } from "@/lib/onboarding/cadence";
import { Card, SectionTitle } from "@/components/ui/card";

/**
 * The Insights tab — real charts of the week, in plain SVG.
 *
 * Two questions, two charts, one hue. "Where did the time go" is magnitude by
 * category, so it is horizontal bars in a single colour with the value at the
 * end of each — colouring bars of one measure by their category would spend
 * the identity channel on what the bar's length already says. "How did the
 * week go" is the same measure by day, as columns.
 *
 * No chart library: two dozen rectangles don't justify one, and the page ships
 * no JavaScript for them. Each mark carries a native tooltip; a table view sits
 * under each chart so nothing is colour-only or hover-only.
 *
 * Marks follow the house specs — bars at most 24px thick, 4px rounded at the
 * data end and square at the baseline, hairline recessive gridlines, values in
 * text tokens rather than the series colour.
 */

const BAR = 20;
const GAP = 12;

export function HoursByCategory({ totals }: { totals: CategoryTotal[] }) {
  if (totals.length === 0) return null;

  const max = Math.max(...totals.map((t) => t.minutes));
  const labelWidth = 150;
  const valueWidth = 56;
  const width = 560;
  const plot = width - labelWidth - valueWidth;
  const height = totals.length * (BAR + GAP) - GAP;

  return (
    <Card>
      <SectionTitle>Where the time went</SectionTitle>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full min-w-[26rem]"
          role="img"
          aria-label="Hours by category this week"
        >
          {totals.map((row, i) => {
            const y = i * (BAR + GAP);
            const w = Math.max(4, (row.minutes / max) * plot);
            return (
              <g key={row.slug}>
                <title>{`${row.label}: ${formatMinutes(row.minutes)}`}</title>
                <text
                  x={labelWidth - 10}
                  y={y + BAR / 2}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-ink/70 text-[13px]"
                >
                  {row.label}
                </text>
                {/* Square at the baseline, 4px rounded at the data end: a plain
                    rect plus a clip would do it, but a path is simpler. */}
                <path
                  d={`M ${labelWidth} ${y} h ${w - 4} a 4 4 0 0 1 4 4 v ${BAR - 8} a 4 4 0 0 1 -4 4 h ${-(w - 4)} z`}
                  fill={CHART_HUE}
                />
                <text
                  x={labelWidth + w + 8}
                  y={y + BAR / 2}
                  dominantBaseline="middle"
                  className="fill-ink font-mono text-[12px]"
                >
                  {formatMinutes(row.minutes)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <AsTable rows={totals.map((t) => [t.label, formatMinutes(t.minutes)])} head={["Category", "Time"]} />
    </Card>
  );
}

export function HoursByDay({
  weekStart,
  minutesByDay,
}: {
  weekStart: string;
  minutesByDay: Map<string, number>;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const values = days.map((d) => minutesByDay.get(d) ?? 0);
  if (values.every((v) => v === 0)) return null;

  const max = Math.max(60, ...values);
  const width = 560;
  const height = 200;
  const padTop = 16;
  const padBottom = 28;
  const plotH = height - padTop - padBottom;
  const slot = width / 7;
  const barW = Math.min(24, slot * 0.5);
  const LETTERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Hairlines at whole hours, at most four so they stay recessive.
  const hourStep = Math.max(1, Math.ceil(max / 60 / 4));
  const gridHours = Array.from({ length: Math.floor(max / 60 / hourStep) + 1 }, (_, i) => i * hourStep);

  return (
    <Card>
      <SectionTitle>How the week went</SectionTitle>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label="Hours by day this week"
      >
        {gridHours.map((h) => {
          const y = padTop + plotH - (h * 60 / max) * plotH;
          return (
            <g key={h}>
              <line x1={0} x2={width} y1={y} y2={y} className="stroke-ink/8" strokeWidth={1} />
              <text x={0} y={y - 4} className="fill-ink/40 font-mono text-[11px]">
                {h}h
              </text>
            </g>
          );
        })}
        {days.map((day, i) => {
          const v = values[i];
          const h = v === 0 ? 0 : Math.max(4, (v / max) * plotH);
          const x = i * slot + (slot - barW) / 2;
          const y = padTop + plotH - h;
          return (
            <g key={day}>
              <title>{`${LETTERS[i]}: ${formatMinutes(v)}`}</title>
              {h > 0 ? (
                <path
                  d={`M ${x} ${y + 4} a 4 4 0 0 1 4 -4 h ${barW - 8} a 4 4 0 0 1 4 4 v ${h - 4} h ${-barW} z`}
                  fill={CHART_HUE}
                />
              ) : null}
              <text
                x={i * slot + slot / 2}
                y={height - 8}
                textAnchor="middle"
                className="fill-ink/60 text-[12px]"
              >
                {LETTERS[i]}
              </text>
            </g>
          );
        })}
      </svg>
      <AsTable
        head={["Day", "Time"]}
        rows={days.map((d, i) => [LETTERS[i], formatMinutes(values[i])])}
      />
    </Card>
  );
}

function AsTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-caption text-ink/50 hover:text-ink">
        As a table
      </summary>
      <table className="mt-2 w-full text-small">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="py-1 text-left font-medium text-ink/60">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="border-t border-ink/6">
              <td className="py-1 text-ink/80">{r[0]}</td>
              <td className="py-1 font-mono text-ink tabular-nums">{r[1]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
