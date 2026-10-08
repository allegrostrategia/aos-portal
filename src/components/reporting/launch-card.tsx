import Link from "next/link";

import { Card } from "@/components/ui/card";
import { formatValue } from "@/lib/reporting/format";
import type { LaunchSummary } from "@/lib/reporting/launch-figures";
import type { LaunchRow, LaunchStatus } from "@/lib/reporting/launch-queries";

/**
 * One launch, as a card in the row across the top of the Launches page.
 *
 * §6's approved mockup: status, total revenue, sales against goal, and a
 * progress ring. The ring is drawn rather than charted — it is one number
 * against one target, which is a shape, not a chart.
 */

const STATUS_LABEL: Record<LaunchStatus, string> = {
  planning: "Planning",
  live: "Live now",
  completed: "Completed",
};

/**
 * A status is a word before it is a colour.
 *
 * The same rule as the traffic lights on the Overview: red and green are
 * the pair most colourblind readers cannot separate, so nothing here is
 * carried by colour alone.
 */
const STATUS_TONE: Record<LaunchStatus, string> = {
  planning: "bg-cream-deep text-ink/70",
  live: "bg-gold/30 text-ink",
  completed: "bg-sky/30 text-ink",
};

/** The ring: one number against one goal, as a stroked circle. */
function ProgressRing({ percent }: { percent: number | null }) {
  const shown = percent === null ? 0 : Math.max(0, Math.min(percent, 100));
  const radius = 26;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg
      viewBox="0 0 64 64"
      className="h-16 w-16 shrink-0"
      role="img"
      aria-label={
        percent === null ? "No goal set" : `${Math.round(percent)} per cent of the goal`
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
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          className="text-orange"
          strokeDasharray={`${(shown / 100) * circumference} ${circumference}`}
          // Start at twelve o'clock rather than three, which is where a
          // reader's eye starts on a dial.
          transform="rotate(-90 32 32)"
        />
      )}
      <text
        x="32"
        y="36"
        textAnchor="middle"
        className="fill-ink font-mono text-[0.85rem]"
      >
        {percent === null ? "—" : `${Math.round(percent)}%`}
      </text>
    </svg>
  );
}

export function LaunchCard({
  launch,
  summary,
  href,
  goal,
}: {
  launch: LaunchRow;
  summary: LaunchSummary;
  href: string;
  /** The goal the ring is drawn against — §6.1's Good, by default. */
  goal: number | null;
  currency?: string;
}) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={href}
            className="font-display text-h3 font-medium text-ink underline-offset-4 hover:underline"
          >
            {launch.name}
          </Link>
          {launch.description ? (
            <p className="mt-1 text-small text-ink/60">{launch.description}</p>
          ) : null}
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-caption font-medium tracking-wide ${STATUS_TONE[launch.status]}`}
        >
          {STATUS_LABEL[launch.status]}
        </span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <dl className="flex flex-col gap-2">
          <div>
            <dt className="text-caption uppercase tracking-wide text-ink/55">Revenue</dt>
            <dd className="font-mono text-h3 text-ink">
              {formatValue(summary.totalRevenue, "currency", "GBP")}
            </dd>
          </div>
          <div>
            <dt className="text-caption uppercase tracking-wide text-ink/55">Sales</dt>
            <dd className="font-mono text-body text-ink">
              {summary.totalSales ?? "—"}
              {goal === null ? null : (
                <span className="text-ink/50"> of {goal}</span>
              )}
            </dd>
          </div>
        </dl>
        <ProgressRing percent={summary.percentOfGood} />
      </div>
    </Card>
  );
}
