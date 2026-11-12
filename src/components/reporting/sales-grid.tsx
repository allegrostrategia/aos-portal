"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, Eyebrow, SectionTitle, Stat } from "@/components/ui/card";
import { Field, FormMessage, Select, SubmitButton } from "@/components/ui/form";
import { formatValue, fromInputValue, toInputValue } from "@/lib/reporting/format";
import {
  forecastIn,
  monthsToShow,
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

/** Jan–Dec of the year the month sits in, which is how her grid reads. */
const yearOf = (month: string) =>
  Array.from({ length: 12 }, (_, i) => `${month.slice(0, 4)}-${String(i + 1).padStart(2, "0")}-01`);

const shortMonth = (month: string) => monthLabel(month).split(" ")[0].slice(0, 3);

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
  const [state, action] = useActionState<SalesState, FormData>(props.action, null);
  const money = (v: number | null) => formatValue(v, "currency", props.currency);

  const year = yearOf(props.month);
  const [whole, setWhole] = useState(false);
  const months = whole ? year : monthsToShow(year, props.cells, props.month);

  const [typed, setTyped] = useState<Record<string, string>>(() =>
    Object.fromEntries(props.cells.map((c) => [`${c.salesRowId}|${c.month}`, toInputValue(c.amount)])),
  );

  const read = (rowId: string, month: string) =>
    fromInputValue(typed[`${rowId}|${month}`] ?? "");
  const set = (rowId: string, month: string, value: string) =>
    setTyped((was) => ({ ...was, [`${rowId}|${month}`]: value }));

  /**
   * A row of figures pasted straight in — "typed or pasted by hand into
   * however many months it lasts" (Nina).
   *
   * Tabs, commas or newlines, because what comes off a spreadsheet is
   * tab-separated and what comes out of a message is not. Anything that
   * is not a number stops the run rather than being written as a blank,
   * so a pasted header does not wipe a row.
   */
  const paste = (rowId: string, from: string, text: string) => {
    const values = text
      .trim()
      .split(/[\t,\r\n]+/)
      .map((part) => part.replace(/[£$€\s]/g, ""));
    if (values.length < 2) return false;

    const start = months.indexOf(from);
    const next = { ...typed };
    for (let i = 0; i < values.length && start + i < months.length; i++) {
      const amount = fromInputValue(values[i]);
      if (amount === null) break;
      const month = months[start + i];
      if (props.lockedMonths.includes(month)) continue;
      next[`${rowId}|${month}`] = toInputValue(amount);
    }
    setTyped(next);
    return true;
  };

  const rowTotal = (rowId: string) =>
    year.reduce((t, m) => t + (read(rowId, m) ?? 0), 0);
  const columnTotal = (month: string) =>
    props.rows.reduce((t, r) => t + (read(r.id, month) ?? 0), 0);

  if (props.rows.length === 0) {
    return (
      <Card className="p-5 sm:p-6">
        <SectionTitle>{props.title}</SectionTitle>
        <p className="text-small text-ink/60">
          Add a row below first — an offer you sell, or a client by name.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle aside={props.month.slice(0, 4)}>{props.title}</SectionTitle>

      <p className="mb-4 text-small text-ink/70">
        {props.kind === "actual" ? (
          <>
            What actually landed each month, from the bank and Stripe. A refund or a
            chargeback goes in as a minus — it comes off the month.{" "}
            <strong className="font-medium text-ink">
              Signed a new retainer client?
            </strong>{" "}
            <a href="#what-you-expect" className="text-ink underline underline-offset-2">
              Add them to your forecast.
            </a>
          </>
        ) : (
          <>What you expect each month. Type it, or paste a row of figures straight in.</>
        )}
      </p>

      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="workspace_id" value={props.workspaceId} />

        {/* The sticky first column is what makes a year readable on a
            phone: the names stay put and the months scroll under them. */}
        <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          <table
            id={props.kind === "forecast" ? "what-you-expect" : undefined}
            className="w-full border-collapse text-small"
          >
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card py-2 pr-3 text-left text-caption font-medium uppercase tracking-wide text-ink/60">
                  Row
                </th>
                {months.map((m) => (
                  <th
                    key={m}
                    className={`px-1.5 py-2 text-right text-caption font-medium uppercase tracking-wide ${
                      m === props.month ? "text-ink" : "text-ink/55"
                    }`}
                  >
                    {shortMonth(m)}
                    {props.lockedMonths.includes(m) ? (
                      <span className="block text-[0.6rem] font-normal normal-case text-ink/45">
                        published
                      </span>
                    ) : null}
                  </th>
                ))}
                <th className="py-2 pl-3 text-right text-caption font-medium uppercase tracking-wide text-ink/60">
                  Year
                </th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row) => (
                <tr key={row.id} className="border-t border-ink/8">
                  <th className="sticky left-0 z-10 max-w-[9rem] truncate bg-card py-2 pr-3 text-left font-medium text-ink">
                    {row.name}
                  </th>
                  {months.map((m) => {
                    const monthLocked = props.lockedMonths.includes(m);
                    const value = read(row.id, m);
                    return (
                      <td key={m} className={`px-1 py-1.5 ${m === props.month ? "bg-cream-deep" : ""}`}>
                        {/* **The id carries the grid, the name does not.**
                            Both grids draw the same rows and the same
                            months, so a shared id made every forecast
                            label point at the Actual table's input — one
                            document, two controls, one `for`. The action
                            parses `name`, so that stays as it is. */}
                        <label className="sr-only" htmlFor={`${props.kind}:${row.id}:${m}`}>
                          {`${row.name}, ${monthLabel(m)}`}
                        </label>
                        <input
                          id={`${props.kind}:${row.id}:${m}`}
                          name={`cell:${row.id}:${m}`}
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          disabled={monthLocked}
                          value={typed[`${row.id}|${m}`] ?? ""}
                          onChange={(e) => set(row.id, m, e.target.value)}
                          onPaste={(e) => {
                            if (paste(row.id, m, e.clipboardData.getData("text"))) {
                              e.preventDefault();
                            }
                          }}
                          className={`w-20 rounded-lg border border-ink/12 bg-cream-deep px-2 py-1.5 text-right text-small tabular-nums outline-none transition focus:border-orange focus:bg-card focus:ring-2 focus:ring-orange/30 disabled:opacity-50 ${
                            value !== null && value < 0 ? "text-orange" : "text-ink"
                          }`}
                        />
                      </td>
                    );
                  })}
                  <td className="py-2 pl-3 text-right font-mono tabular-nums text-ink">
                    {money(rowTotal(row.id) || null)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-ink/15">
                <th className="sticky left-0 z-10 bg-card py-2.5 pr-3 text-left text-caption font-medium uppercase tracking-wide text-ink/60">
                  Total
                </th>
                {months.map((m) => (
                  <td
                    key={m}
                    className={`px-1.5 py-2.5 text-right font-mono tabular-nums text-ink ${
                      m === props.month ? "bg-cream-deep" : ""
                    }`}
                  >
                    {money(columnTotal(m) || null)}
                  </td>
                ))}
                <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-ink">
                  {money(year.reduce((t, m) => t + columnTotal(m), 0) || null)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {months.length < year.length ? (
            <Button variant="ghost" size="sm" type="button" onClick={() => setWhole(true)}>
              Show the whole year
            </Button>
          ) : null}
          {props.hiddenCount > 0 && !props.showAll ? (
            <Button variant="ghost" size="sm" type="button" onClick={() => props.onShowAll(true)}>
              {`Show all rows (${props.hiddenCount} with nothing this year)`}
            </Button>
          ) : null}
        </div>

        <FormMessage error={state?.error} notice={state?.notice} />
        {props.locked ? (
          <p className="text-caption text-ink/60">
            {monthLabel(props.month)} is published, so its column is fixed. Unpublish it to
            make changes.
          </p>
        ) : null}
        <SubmitButton full={false}>
          {props.kind === "actual" ? "Save what came in" : "Save the forecast"}
        </SubmitButton>
      </form>
    </Card>
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
    <form action={action} className="flex items-end gap-2">
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
        >
          <option value="none">No, one-off</option>
          <option value="monthly">Yes, monthly</option>
          <option value="annual">Yes, annually</option>
        </Select>
      </div>
      <SubmitButton full={false}>Save</SubmitButton>
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
          <Field label="Name" name="name" required maxLength={120} />
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
        <Eyebrow>Rows are never removed, so last year&rsquo;s figures keep theirs</Eyebrow>
        <FormMessage error={state?.error} notice={state?.notice} />
        <SubmitButton full={false}>Add the row</SubmitButton>
      </form>
    </Card>
  );
}
