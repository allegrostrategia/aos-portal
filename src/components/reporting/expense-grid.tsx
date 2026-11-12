"use client";

import { useActionState, useState } from "react";

import { MoneyGrid } from "@/components/reporting/money-grid";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle, Stat } from "@/components/ui/card";
import { Field, FormMessage, Select, SubmitButton } from "@/components/ui/form";
import {
  addDefaultCategories,
  saveExpenseCategory,
  saveExpenses,
} from "@/lib/reporting/expense-actions";
import { DEFAULT_EXPENSE_CATEGORIES } from "@/lib/reporting/expense-categories";
import type { ExpenseCategory } from "@/lib/reporting/expense-queries";
import { formatValue } from "@/lib/reporting/format";
import { costsByBucket, type ExpenseBucket, type ExpenseRow } from "@/lib/reporting/ledger";
import type { SalesState } from "@/lib/reporting/sales-actions";

/**
 * What it cost: categories down the side, months across.
 *
 * The third grid on the Financials screen and the same component as the
 * other two. What is different is the rows — about twenty categories,
 * offered as a list from Nina's own tracker and then the client's to
 * rename and retire — and the thing that cannot be changed: **which of
 * the four buckets a category feeds.** Total costs, Profit and the
 * margin are built on those four, so a client tidying their list is not
 * also redrawing their P&L.
 *
 * Each figure keeps the bucket it was saved with (`report_expenses.
 * bucket`, filled by a trigger), so if a category ever does move, the
 * months already published keep the composition they went out with.
 */

const BUCKETS: { key: ExpenseBucket; label: string; examples: string }[] = [
  { key: "fixed", label: "Fixed", examples: "Subscriptions, rent, software" },
  { key: "variable", label: "Variable", examples: "Ads, contractors, fees" },
  { key: "team", label: "Team", examples: "Salaries, VAs, freelancers" },
  { key: "investment", label: "Investment", examples: "Courses, coaching, events" },
];

const bucketLabel = (bucket: ExpenseBucket) =>
  BUCKETS.find((b) => b.key === bucket)?.label ?? bucket;

export interface ExpenseGridProps {
  workspaceId: string;
  month: string;
  currency: string;
  categories: ExpenseCategory[];
  expenses: ExpenseRow[];
  lockedMonths: string[];
  locked: boolean;
}

export function ExpenseGrid(props: ExpenseGridProps) {
  const money = (v: number | null) => formatValue(v, "currency", props.currency);
  const thisMonth = costsByBucket(props.expenses, props.month);
  const live = props.categories.filter((c) => c.active);

  return (
    <div className="flex flex-col gap-6">
      <MoneyGrid
        workspaceId={props.workspaceId}
        month={props.month}
        currency={props.currency}
        title="What it cost"
        kind="expense"
        rows={live.map((c) => ({ id: c.id, name: c.name }))}
        cells={props.expenses.map((e) => ({
          rowId: e.categoryId,
          month: e.month,
          amount: e.amount,
        }))}
        action={saveExpenses}
        saveLabel="Save what it cost"
        empty="Add a category below first, or start with the usual list."
        lockedMonths={props.lockedMonths}
        locked={props.locked}
        anchor="what-it-cost"
        /**
         * **A cost cannot run ahead of the month being entered either**
         * (Dom, 13 November), the same rule the Actual grid wears. There
         * is no cost forecast for launch, so a figure in a month that
         * has not happened is a guess sitting in a grid called "what it
         * cost" — and nothing on the report would mark it as one.
         */
        ahead={(m) => m > props.month}
        aheadLabel="to come"
        note={
          <>
            What each category cost, month by month. Type it, or paste a row of figures
            straight in. Every category feeds one of the four cost buckets, which is what
            Total costs, Profit and the margin are built on.
          </>
        }
      />

      {live.length > 0 ? (
        <Card className="p-5 sm:p-6">
          <SectionTitle aside={new Date(props.month).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}>
            This month&rsquo;s costs
          </SectionTitle>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            {BUCKETS.map((bucket) => (
              <Stat
                key={bucket.key}
                label={bucket.label}
                value={money(thisMonth[bucket.key])}
                detail={bucket.examples}
              />
            ))}
          </div>
        </Card>
      ) : null}

      <CategorySetup {...props} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The categories down the left-hand side
// ---------------------------------------------------------------------------

function CategorySetup(props: ExpenseGridProps) {
  const [state, action] = useActionState<SalesState, FormData>(saveExpenseCategory, null);
  const [defaults, defaultsAction] = useActionState<SalesState, FormData>(
    addDefaultCategories,
    null,
  );
  const [showExamples, setShowExamples] = useState(props.categories.length === 0);
  /**
   * **The list is folded away once there is one.**
   *
   * Twenty categories, each a row, is nine thousand pixels of setup
   * sitting under a screen whose job is entering numbers — and the
   * renaming is done once, in the first month, not every month. Open
   * when there is nothing yet, because then it is the only thing to do.
   */
  const [showList, setShowList] = useState(props.categories.length === 0);
  const retired = props.categories.filter((c) => !c.active);

  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle>Your cost categories</SectionTitle>
      <p className="mb-4 text-small text-ink/70">
        Rename any of these, retire the ones that aren&rsquo;t yours, and add your own.{" "}
        <strong className="font-medium text-ink">
          What a category feeds is set when it&rsquo;s made
        </strong>{" "}
        — the four buckets are what Total costs and the margin are built on.
      </p>

      {props.categories.length > 0 ? (
        <Button
          variant="secondary"
          size="sm"
          type="button"
          className="mb-5"
          onClick={() => setShowList((on) => !on)}
        >
          {showList
            ? "Hide the list"
            : `Rename or retire a category (${props.categories.length})`}
        </Button>
      ) : null}

      {props.categories.length > 0 && showList ? (
        <ul className="mb-5 flex flex-col divide-y divide-ink/8">
          {props.categories.map((category) => (
            <CategoryRow key={category.id} category={category} workspaceId={props.workspaceId} />
          ))}
        </ul>
      ) : null}

      {retired.length > 0 ? (
        <p className="mb-5 text-caption text-ink/60">
          A retired category comes off the grid. Every figure ever saved against it stays,
          and goes on counting in the months it was in.
        </p>
      ) : null}

      {showList || props.categories.length === 0 ? (
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="workspace_id" value={props.workspaceId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" name="name" required maxLength={120} />
          <Select
            label="What it feeds"
            name="bucket"
            defaultValue="fixed"
            hint="Set once, when the category is made."
          >
            {BUCKETS.map((bucket) => (
              <option key={bucket.key} value={bucket.key}>
                {`${bucket.label} — ${bucket.examples.toLowerCase()}`}
              </option>
            ))}
          </Select>
        </div>
        <FormMessage error={state?.error} notice={state?.notice} />
        <SubmitButton full={false}>Add the category</SubmitButton>
      </form>
      ) : null}

      {/* **The usual list is offered once.** Once there is a list it is
          theirs, and a button that says "start with" beside twenty rows
          they have already renamed is offering to start something that
          has started (Dom, 13 November). The notice from pressing it
          stays, because it is what says the twenty rows arrived. */}
      {showList || props.categories.length === 0 ? (
      <div className="mt-6 border-t border-ink/10 pt-5">
        <form action={defaultsAction} className="flex flex-col gap-3">
          <input type="hidden" name="workspace_id" value={props.workspaceId} />
          <div className="flex flex-wrap items-center gap-3">
            {props.categories.length === 0 ? (
              <SubmitButton full={false}>Start with the usual list</SubmitButton>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setShowExamples((on) => !on)}
            >
              {showExamples ? "Hide the usual list" : "See the usual list"}
            </Button>
          </div>
          <FormMessage error={defaults?.error} notice={defaults?.notice} />
        </form>

        {showExamples ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BUCKETS.map((bucket) => (
              <div key={bucket.key} className="rounded-card bg-cream-deep p-4">
                <p className="text-caption font-medium uppercase tracking-wide text-ink/60">
                  {bucket.label}
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-small text-ink/80">
                  {DEFAULT_EXPENSE_CATEGORIES.filter((c) => c.bucket === bucket.key).map((c) => (
                    <li key={c.name}>{c.name}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      ) : null}
    </Card>
  );
}

/**
 * One category: its name, what it feeds, and whether it is on the grid.
 *
 * **Twenty rows, so no Save button on any of them** (the rule Dom set
 * for "does it recur?" on the grid above, and twenty times the reason):
 * the name saves when the field is left, and the notice beside it
 * confirms it. Retiring stays a button, because it is a decision rather
 * than a correction — but a quiet one, since twenty orange pills down a
 * list is a wall rather than a list.
 */
function CategoryRow({
  category,
  workspaceId,
}: {
  category: ExpenseCategory;
  workspaceId: string;
}) {
  const [state, action] = useActionState<SalesState, FormData>(saveExpenseCategory, null);

  return (
    <li className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 py-3 first:pt-0">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="workspace_id" value={workspaceId} />
        <input type="hidden" name="category_id" value={category.id} />
        <div className="w-48">
          {/* Keyed on the saved name: React resets a form's fields once
              its action finishes, so without this a rename reverted on
              screen beside a notice saying it had been saved. */}
          <Field
            key={category.name}
            label={`Name of ${category.name}`}
            hideLabel
            name="name"
            id={`category-name:${category.id}`}
            defaultValue={category.name}
            maxLength={120}
            className="!py-1.5 text-small"
            // Saved when the field is left, and only when it changed —
            // so tabbing through twenty categories does not write twenty
            // rows that say what they already said.
            onBlur={(e) => {
              if (e.currentTarget.value.trim() !== category.name) {
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
        </div>
        <FormMessage error={state?.error} notice={state?.notice} />
      </form>

      <div className="flex items-center gap-3">
        <span className="text-caption text-ink/60">
          {bucketLabel(category.bucket)}
          {category.active ? "" : " · retired"}
        </span>
        <form action={action}>
          <input type="hidden" name="workspace_id" value={workspaceId} />
          <input type="hidden" name="category_id" value={category.id} />
          <input type="hidden" name="name" value={category.name} />
          <input type="hidden" name="retire" value={category.active ? "yes" : "no"} />
          <SubmitButton full={false} variant="ghost" size="sm">
            {category.active ? "Retire" : "Put back"}
          </SubmitButton>
        </form>
      </div>
    </li>
  );
}
