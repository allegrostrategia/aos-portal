"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, SectionTitle, Stat } from "@/components/ui/card";
import { Field, FormMessage, Select, SubmitButton } from "@/components/ui/form";
import { MoneyGrid } from "@/components/reporting/money-grid";
import { formatValue } from "@/lib/reporting/format";
import {
  forecastIn,
  receivedIn,
  recurringSplit,
  rowsWithFigures,
  type ActualCell,
  type Cell,
  type SalesRow,
} from "@/lib/reporting/ledger";
import { monthLabel } from "@/lib/reporting/months";
import {
  saveActuals,
  saveForecasts,
  saveSalesRow,
  type SalesState,
} from "@/lib/reporting/sales-actions";

/**
 * Financials: two grids, and the rows down the side of them.
 *
 * Nina, 13 November. The first version of this screen asked for a sale
 * with a payment plan — a value, how it was billed, instalments across the
 * months, which of them had been paid. **What she actually does is open
 * the bank account and Stripe and type in what landed.** So:
 *
 *   · **What came in** is money received, one figure per row per month.
 *   · **What you expect** is the same grid for money expected, typed or
 *     pasted across however many months it lasts. Retainers live here
 *     because somebody puts them here; nothing is generated.
 *
 * No sale, no schedule, no due-versus-received, no cancellation, no
 * retiring a row. The screen is for entering numbers.
 */

export interface SalesGridProps {
  workspaceId: string;
  /** The month being entered. */
  month: string;
  currency: string;
  rows: SalesRow[];
  actuals: ActualCell[];
  forecasts: Cell[];
  /** The client's offers, for the optional link on an offer row. */
  offers: { id: string; name: string }[];
  /** Published months, whose cells are read-only. */
  lockedMonths: string[];
  /** Whether the month being entered is itself published. */
  locked: boolean;
}

export function SalesGrid(props: SalesGridProps) {
  const money = (v: number | null) => formatValue(v, "currency", props.currency);
  const split = recurringSplit(props.actuals, props.month);

  /**
   * One toggle for both grids, because they have to line up: a client
   * hidden from one and shown on the other reads as a bug.
   */
  const [showAll, setShowAll] = useState(false);
  const withFigures = rowsWithFigures(
    props.rows,
    props.actuals,
    props.forecasts,
    props.month.slice(0, 4),
  );
  const shown = showAll ? props.rows : withFigures;
  const hidden = props.rows.length - shown.length;

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5 sm:p-6">
        <SectionTitle aside={monthLabel(props.month)}>This month</SectionTitle>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
          <Stat
            label="Came in"
            value={money(receivedIn(props.actuals, props.month))}
            detail="What actually landed, from the bank and Stripe"
          />
          <Stat
            label="Expected"
            value={money(forecastIn(props.forecasts, props.month))}
            detail="What the forecast said for this month"
          />
          <Stat
            label="Recurring"
            value={money(split.combined)}
            detail="Monthly and annual together, of the money received"
          />
        </div>
      </Card>

      <Grid
        {...props}
        kind="actual"
        title="What came in"
        cells={props.actuals}
        action={saveActuals}
        rows={shown}
        hiddenCount={hidden}
        showAll={showAll}
        onShowAll={setShowAll}
      />

      <Grid
        {...props}
        kind="forecast"
        title="What you expect"
        cells={props.forecasts}
        action={saveForecasts}
        rows={shown}
        hiddenCount={hidden}
        showAll={showAll}
        onShowAll={setShowAll}
      />

      <RowSetup {...props} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// One grid: rows down, months across
// ---------------------------------------------------------------------------

/**
 * Both grids are `<MoneyGrid>`, which the expense grid below them is too.
 *
 * What differs is five props: the title, the note, the save button, the
 * action, and whether the grid may run ahead of the month being entered.
 */
interface GridProps extends SalesGridProps {
  kind: "actual" | "forecast";
  title: string;
  cells: Cell[];
  action: (prev: SalesState, formData: FormData) => Promise<SalesState>;
  rows: SalesRow[];
  hiddenCount: number;
  showAll: boolean;
  onShowAll: (on: boolean) => void;
}

function Grid(props: GridProps) {
  return (
    <MoneyGrid
      workspaceId={props.workspaceId}
      month={props.month}
      currency={props.currency}
      title={props.title}
      kind={props.kind}
      rows={props.rows}
      cells={props.cells.map((c) => ({ rowId: c.salesRowId, month: c.month, amount: c.amount }))}
      action={props.action}
      saveLabel={`Save ${props.title.toLowerCase()}`}
      empty="Add a row below first — an offer you sell, or a client by name."
      lockedMonths={props.lockedMonths}
      locked={props.locked}
      anchor={props.kind === "forecast" ? "what-you-expect" : undefined}
      /**
       * **What came in cannot run ahead of the month being entered**
       * (Dom, 13 November). October's money has not landed while
       * September is being typed up, so a figure in that column would be
       * a forecast wearing the Actual grid's name.
       *
       * The column stays rather than being cut, so the two grids line up
       * and so the heading can say where that money goes instead.
       * `saveActuals` refuses one as well — this is the half that means
       * nobody is invited to try.
       */
      ahead={props.kind === "actual" ? (m) => m > props.month : undefined}
      aheadLabel="forecast"
      note={
        props.kind === "actual" ? (
          <>
            What actually landed each month, from the bank and Stripe. A refund or a
            chargeback goes in as a minus — it comes off the month.{" "}
            <strong className="font-medium text-ink">Signed a new retainer client?</strong>{" "}
            <a href="#what-you-expect" className="text-ink underline underline-offset-2">
              Add them to your forecast.
            </a>
          </>
        ) : (
          <>What you expect each month. Type it, or paste a row of figures straight in.</>
        )
      }
      extraToggles={
        props.hiddenCount > 0 && !props.showAll ? (
          <Button variant="ghost" size="sm" type="button" onClick={() => props.onShowAll(true)}>
            {`Show all rows (${props.hiddenCount} with nothing this year)`}
          </Button>
        ) : null
      }
    />
  );
}

// ---------------------------------------------------------------------------
// The rows down the left-hand side
// ---------------------------------------------------------------------------

/**
 * Changing whether a row recurs, after it exists.
 *
 * **The January-to-April case needs this**, which is the case the whole
 * redesign turns on: a client pays one-off in January and goes onto a
 * retainer in April, and somebody has to be able to say so in April. With
 * only the add form, the answer would have been a second row for the same
 * client — two rows where the business has one relationship.
 *
 * It is safe to change at any time, and the text says so: the setting is
 * the starting point for new months, and each month already saved keeps
 * the answer it was saved with.
 */
function RowRecurrence({ row, ...props }: SalesGridProps & { row: SalesRow }) {
  const [state, action] = useActionState<SalesState, FormData>(saveSalesRow, null);

  /**
   * **Saved on change, with no button of its own** (Dom, 13 November).
   * One control carrying one decision, on a screen whose job is entering
   * numbers; the notice beside it is what says the change went through.
   *
   * **Keyed on the saved value, and that is not a style choice.**
   *
   * React resets a form's fields once its action finishes, back to the
   * `defaultValue` they mounted with. So choosing "Yes, monthly" and
   * saving left this reading "No, one-off" beside a notice saying it had
   * been updated — the database right, the screen wrong. Caught on the
   * phone screenshot, 13 November; the test had checked the notice and
   * the figure, not the control it had just used.
   *
   * Making it controlled did not fix it: React only writes `value` to the
   * DOM when its own value changed, and after the reset its value had
   * not. A key does, because the saved value changing remounts the field
   * — and on a refusal, where the saved value has not changed, the reset
   * puts back what is actually stored, which is the honest answer to show
   * beside the error.
   */

  return (
    <form action={action} className="flex flex-col items-start gap-1 sm:items-end">
      <input type="hidden" name="workspace_id" value={props.workspaceId} />
      <input type="hidden" name="row_id" value={row.id} />
      <input type="hidden" name="name" value={row.name} />
      <input type="hidden" name="row_type" value={row.rowType} />
      <input type="hidden" name="offer_entity_id" value={row.offerEntityId ?? ""} />
      <div className="w-44">
        <Select
          key={row.recurrence}
          label={`Does ${row.name} recur?`}
          name="recurrence"
          // One per row, all called `recurrence`, plus the add form's own.
          id={`recurrence:${row.id}`}
          defaultValue={row.recurrence}
          className="!py-1.5 text-small"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          <option value="none">No, one-off</option>
          <option value="monthly">Yes, monthly</option>
          <option value="annual">Yes, annually</option>
        </Select>
      </div>
      <FormMessage error={state?.error} notice={state?.notice} />
    </form>
  );
}

function RowSetup(props: SalesGridProps) {
  const [state, action] = useActionState<SalesState, FormData>(saveSalesRow, null);
  const [rowType, setRowType] = useState<"offer" | "client">("offer");

  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle>Your rows</SectionTitle>
      <p className="mb-4 text-small text-ink/70">
        List your offers, or list a client by name if they&rsquo;re on a retainer or bespoke
        package.
      </p>

      {props.rows.length > 0 ? (
        <ul className="mb-5 flex flex-col divide-y divide-ink/8">
          {props.rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 py-3 first:pt-0"
            >
              <div className="min-w-0">
                <p className="truncate text-body text-ink">{row.name}</p>
                <p className="text-caption text-ink/60">
                  {row.rowType === "offer" ? "Offer" : "Client"}
                  {row.offerEntityId
                    ? ` · linked to ${props.offers.find((o) => o.id === row.offerEntityId)?.name ?? "an offer"}`
                    : ""}
                </p>
              </div>
              <RowRecurrence {...props} row={row} />
            </li>
          ))}
        </ul>
      ) : null}

      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="workspace_id" value={props.workspaceId} />
        <div className="grid gap-4 sm:grid-cols-2">
          {/* **An explicit id, because three cards on this screen now
              ask for a name** — a row, a cost category and somebody on
              the team. `Field` defaults the id to the name, so without
              this all three labels point at whichever input is first in
              the document and two of them select nothing. */}
          <Field label="Name" name="name" id="row-name" required maxLength={120} />
          <Select
            label="What it is"
            name="row_type"
            value={rowType}
            onChange={(e) => setRowType(e.target.value as "offer" | "client")}
          >
            <option value="offer">An offer</option>
            <option value="client">A client</option>
          </Select>
          <Select
            label="Does it recur?"
            name="recurrence"
            defaultValue="none"
            hint="The starting point for new months. Change it any time — the months already saved keep what they were saved with."
          >
            <option value="none">No, one-off</option>
            <option value="monthly">Yes, monthly</option>
            <option value="annual">Yes, annually</option>
          </Select>
          {rowType === "offer" ? (
            <Select
              label="Link to an offer"
              name="offer_entity_id"
              defaultValue=""
              hint="Optional. A linked row's money reaches the Offers charts."
            >
              <option value="">Not linked</option>
              {props.offers.map((offer) => (
                <option key={offer.id} value={offer.id}>
                  {offer.name}
                </option>
              ))}
            </Select>
          ) : (
            <p className="self-end text-caption text-ink/60">
              A client row carries its own profitability — hours against what they paid.
            </p>
          )}
        </div>
        <FormMessage error={state?.error} notice={state?.notice} />
        <SubmitButton full={false}>Add the row</SubmitButton>
      </form>
    </Card>
  );
}
