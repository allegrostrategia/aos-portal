import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { EntryForm } from "@/components/reporting/entry-form";
import { PublishBadge, ReportShell } from "@/components/reporting/report-shell";
import { ENTRY_CATEGORIES, categoryBySlug } from "@/lib/reporting/categories";
import { reportHref, resolveReportContext } from "@/lib/reporting/context";
import { monthLabel } from "@/lib/reporting/months";
import { getMetricsFor, getMonthData } from "@/lib/reporting/queries";

export const metadata: Metadata = {
  title: "Enter your data — aOS",
};

/**
 * The entry screen, for one category and one month.
 *
 * One page for every category: the fields come from `report_metrics`, so
 * adding a field to the brief is a row in the seed and nothing here changes
 * (§9). The categories that are not ready yet have no route at all rather
 * than a page saying so — §13's one-route rule.
 */
export default async function EnterCategoryPage({
  params,
  searchParams,
}: PageProps<"/reporting/enter/[category]">) {
  const { category: slug } = await params;
  const search = await searchParams;

  const category = categoryBySlug(slug);
  if (!category || !category.entry) notFound();

  const ctx = await resolveReportContext({
    workspace: typeof search.workspace === "string" ? search.workspace : undefined,
    month: typeof search.month === "string" ? search.month : undefined,
  });

  // A retainer client has no entry screen at all (§2: they view and comment).
  // Sent to the report rather than shown a refusal — the refusal would be
  // explaining a screen that is not theirs to think about.
  if (!ctx.canEdit) {
    redirect(reportHref(`/reporting/${category.slug}`, ctx));
  }

  // Hidden categories do not appear and do not count towards completion
  // (§8.1), so there is nothing here to fill in either.
  if (ctx.workspace.hidden_categories.includes(category.key)) {
    redirect(reportHref("/reporting", ctx));
  }

  const [metrics, data] = await Promise.all([
    getMetricsFor(category.key),
    getMonthData(ctx.workspace.id, ctx.month.month, ctx.month.previous),
  ]);

  const core = metrics.filter((m) => m.input_type === "core");
  const optional = metrics.filter((m) => m.input_type === "optional");
  const calculated = metrics.filter((m) => m.input_type === "calc");

  // The calculated card needs last month for growth and rate-against-last-
  // month figures, and every typed field needs it for the hint underneath.
  const keysNeeded = [...core, ...optional, ...calculated].map((m) => m.key);
  const initial = Object.fromEntries(
    [...core, ...optional].map((m) => [m.key, data.values.get(m.key)]),
  );
  const previous = Object.fromEntries(
    keysNeeded.map((key) => [key, data.previous.get(key)]),
  );

  // "Save & next section" walks the entry categories in tab order.
  const order = ENTRY_CATEGORIES.filter(
    (c) => !ctx.workspace.hidden_categories.includes(c.key),
  );
  const position = order.findIndex((c) => c.key === category.key);
  const next = position >= 0 ? order[position + 1] : undefined;

  return (
    <ReportShell
      ctx={ctx}
      active={category.key}
      path={`/reporting/enter/${category.slug}`}
      title="Enter your data"
      tagline={`${category.label} · ${ctx.month.label}`}
      actions={
        <PublishBadge
          kind={ctx.workspace.kind}
          publishedAt={data.period?.published_at ?? null}
        />
      }
    >
      <EntryForm
        category={category.key}
        categoryLabel={category.label}
        workspaceId={ctx.workspace.id}
        month={ctx.month.month}
        previousLabel={
          ctx.month.previous ? monthLabel(ctx.month.previous).split(" ")[0] : null
        }
        currency={ctx.workspace.currency}
        core={core}
        optional={optional}
        calculated={calculated}
        initial={initial}
        previous={previous}
        nextHref={
          next ? reportHref(`/reporting/enter/${next.slug}`, ctx) : null
        }
        // "Save & Email" reads as emailing the report rather than moving
        // to the Email section. The mockup's own wording avoids that.
        nextLabel={next ? "Save & next section" : null}
      />
    </ReportShell>
  );
}
