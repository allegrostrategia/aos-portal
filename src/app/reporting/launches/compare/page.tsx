import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ReportShell } from "@/components/reporting/report-shell";
import { Card, SectionTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { STAGE_4 } from "@/lib/reporting/categories";
import { reportHref, resolveReportContext } from "@/lib/reporting/context";
import { formatValue } from "@/lib/reporting/format";
import { launchSummary, stageFigures } from "@/lib/reporting/launch-figures";
import { getLaunch, getLaunches, type LaunchDetail } from "@/lib/reporting/launch-queries";
import { launch as launchFormulas } from "@/lib/reporting/formulas";
import type { Unit } from "@/lib/reporting/format";

export const metadata: Metadata = { title: "Compare launches — aOS" };

/**
 * §6.7: any two launches, side by side.
 *
 * **The team's screen, not the client's** (Nina's decision 11). Showing a
 * client this launch against their better one is a conversation Nina
 * should choose to have, not a page they can find on their own.
 *
 * The picker is a plain form with two selects and a submit — no
 * JavaScript, so it works the moment the HTML lands. Which two launches
 * are being compared lives in the URL, so the view is linkable and the
 * back button does what it looks like it does.
 */

interface Row {
  label: string;
  unit: Unit;
  /** Up is better, down is better, or neither. */
  direction: "up" | "down" | "none";
  of: (detail: LaunchDetail) => number | null;
}

const ROWS: Row[] = [
  { label: "Sign-ups", unit: "count", direction: "up",
    of: (d) => sum(stageFigures(d).map((s) => s.signUps)) },
  { label: "Show-up rate", unit: "percent", direction: "up",
    of: (d) => mainStage(d)?.showUpRate ?? null },
  { label: "Pitch retention", unit: "percent", direction: "up",
    of: (d) => mainStage(d)?.pitchRetention ?? null },
  { label: "Conversion rate", unit: "percent", direction: "up",
    of: (d) => launchSummary(d).conversionRate },
  { label: "Total sales", unit: "count", direction: "up",
    of: (d) => launchSummary(d).totalSales },
  { label: "Total revenue", unit: "currency", direction: "up",
    of: (d) => launchSummary(d).totalRevenue },
  { label: "Average order value", unit: "currency", direction: "up",
    of: (d) => launchSummary(d).averageOrderValue },
  { label: "Cost per sale", unit: "currency", direction: "down",
    of: (d) => launchFormulas.costPerSale(
      d.values.get("launches_ad_spend"), launchSummary(d).totalSales) },
  { label: "ROAS", unit: "ratio", direction: "up",
    of: (d) => launchFormulas.roas(
      launchSummary(d).totalRevenue, d.values.get("launches_ad_spend")) },
];

function sum(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0);
}

function mainStage(detail: LaunchDetail) {
  return stageFigures(detail).find((s) => s.stage.is_main_selling_stage) ?? null;
}

export default async function CompareLaunchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!STAGE_4) notFound();

  const search = await searchParams;
  const ctx = await resolveReportContext({
    workspace: typeof search.workspace === "string" ? search.workspace : undefined,
    month: typeof search.month === "string" ? search.month : undefined,
  });

  // Decision 11: the team's screen. A client who reaches it by URL is
  // sent to their own list rather than shown a refusal.
  if (!ctx.canEdit) redirect(reportHref("/reporting/launches", ctx));

  const launches = await getLaunches(ctx.workspace.id);
  const pick = (key: string) =>
    typeof search[key] === "string" ? (search[key] as string) : undefined;

  // **The default pairing is two launches that have run**, newest on the
  // right. Falling back to the two most recent of any kind put a launch
  // still being planned on one side, and every row in the table was a
  // dash against a dash — honest, but it reads as a broken screen rather
  // than as an empty one. Nothing stops either side being changed to a
  // launch that is still in planning; it is simply not where this opens.
  const ran = launches.filter((l) => l.status === "completed");
  const preferred = ran.length >= 2 ? ran : launches;
  const leftId = pick("left") ?? preferred[1]?.id ?? launches[1]?.id;
  const rightId = pick("right") ?? preferred[0]?.id ?? launches[0]?.id;

  const [left, right] = await Promise.all([
    leftId ? getLaunch(leftId) : null,
    rightId ? getLaunch(rightId) : null,
  ]);

  const both =
    left && right && left.launch.id !== right.launch.id
      ? ([left, right] as const)
      : null;

  return (
    <ReportShell
      ctx={ctx}
      active="launches"
      path="/reporting/launches/compare"
      title="Compare launches"
      tagline={`SIDE BY SIDE · ${ctx.workspace.business_name}`}
    >
      {launches.length < 2 ? (
        <Card>
          <SectionTitle>Not enough launches yet</SectionTitle>
          <p className="text-body text-ink/70">
            Two launches are needed before there is anything to compare.
          </p>
        </Card>
      ) : (
        <>
          <Card className="mb-6">
            {/* A plain GET form: the choice ends up in the URL, so the
                view is linkable and the back button works. No script. */}
            <form method="get" className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="workspace" value={ctx.workspace.id} />
              {(["left", "right"] as const).map((side) => (
                <label key={side} className="flex flex-col gap-1.5">
                  <span className="text-caption uppercase tracking-wide text-ink/55">
                    {side === "left" ? "Compare" : "With"}
                  </span>
                  <select
                    name={side}
                    defaultValue={(side === "left" ? leftId : rightId) ?? ""}
                    className="rounded-xl border border-ink/12 bg-card px-3.5 py-2.5 text-body text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/30"
                  >
                    {launches.map((launch) => (
                      <option key={launch.id} value={launch.id}>
                        {launch.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <Button type="submit" variant="secondary">
                Show me
              </Button>
            </form>
          </Card>

          {both ? (
            <Card>
              <SectionTitle aside={`${both[0].launch.name} → ${both[1].launch.name}`}>
                Side by side
              </SectionTitle>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ink/10 text-caption uppercase tracking-wide text-ink/55">
                    <th className="py-2 text-left font-medium">Figure</th>
                    <th className="py-2 text-right font-medium">{both[0].launch.name}</th>
                    <th className="py-2 text-right font-medium">{both[1].launch.name}</th>
                    <th className="py-2 text-right font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row) => {
                    const before = row.of(both[0]);
                    const after = row.of(both[1]);
                    const moved =
                      before === null || after === null || before === 0
                        ? null
                        : ((after - before) / Math.abs(before)) * 100;
                    // The arrow says which way it went; the colour says
                    // whether that is good. Neither alone — the rule the
                    // traffic lights follow.
                    const better =
                      moved === null || row.direction === "none"
                        ? null
                        : row.direction === "up"
                          ? moved > 0
                          : moved < 0;

                    return (
                      <tr key={row.label} className="border-b border-ink/8 last:border-b-0">
                        <td className="py-2.5 text-small text-ink/70">{row.label}</td>
                        <td className="py-2.5 text-right font-mono text-small text-ink">
                          {formatValue(before, row.unit, ctx.workspace.currency)}
                        </td>
                        <td className="py-2.5 text-right font-mono text-small text-ink">
                          {formatValue(after, row.unit, ctx.workspace.currency)}
                        </td>
                        <td
                          className={`py-2.5 text-right font-mono text-small ${
                            better === null
                              ? "text-ink/45"
                              : better
                                ? "text-[#1f7a4d]"
                                : "text-deep-red"
                          }`}
                        >
                          {moved === null
                            ? "—"
                            : `${moved > 0 ? "↑" : moved < 0 ? "↓" : ""} ${Math.abs(Math.round(moved))}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          ) : (
            <Card>
              <SectionTitle>Pick two different launches</SectionTitle>
              <p className="text-body text-ink/70">
                Comparing a launch with itself has nothing to say.
              </p>
            </Card>
          )}
        </>
      )}

      <p className="mt-6 text-caption text-ink/50">
        This screen is yours, not the client&rsquo;s.{" "}
        <Link href={reportHref("/reporting/launches", ctx)} className="underline underline-offset-4">
          Back to the launches
        </Link>
        .
      </p>
    </ReportShell>
  );
}
