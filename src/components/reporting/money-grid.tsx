"use client";

import { useActionState, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { formatValue, fromInputValue, toInputValue } from "@/lib/reporting/format";
import { monthsToShow } from "@/lib/reporting/ledger";
import { monthLabel } from "@/lib/reporting/months";
import type { SalesState } from "@/lib/reporting/sales-actions";

/**
 * A year of money: rows down, months across, a total each way.
 *
 * **One component for all three grids** — what came in, what you expect,
 * and what it cost. Nina asked for the same layout ("its own grid with
 * the same layout"), and the same reason `<NumberedRow>` is one
 * component applies here: three copies of a table with a sticky column,
 * a paste handler and two totals would be three places for one bug.
 *
 * Everything that differs between them is a prop, and there are only
 * five that matter: what the rows are called, which months can take a
 * figure, what the note says, what the save button says, and which
 * action it posts to.
 */

/** One padding rule for a month column, worn by heading, input and total. */
const MONTH_COL = "px-1.5 text-right";

const shortMonth = (month: string) => monthLabel(month).split(" ")[0].slice(0, 3);

/** Jan–Dec of the year the month sits in, which is how her grid reads. */
export const yearOf = (month: string) =>
  Array.from({ length: 12 }, (_, i) => `${month.slice(0, 4)}-${String(i + 1).padStart(2, "0")}-01`);

export interface MoneyGridRow {
  id: string;
  name: string;
}

/**
 * One cell, by the row it is on and the month it is in.
 *
 * Its own shape rather than the ledger's `Cell`: a row here is a sales
 * row on two of these grids and an expense category on the third, and a
 * field called `salesRowId` holding a category id is the kind of thing
 * that reads fine and means nothing.
 */
export interface MoneyGridCell {
  rowId: string;
  month: string;
  amount: number;
}

export interface MoneyGridProps {
  workspaceId: string;
  /** The month being entered. */
  month: string;
  currency: string;
  title: string;
  /** Prefixes every input id, because one page carries three of these. */
  kind: string;
  rows: MoneyGridRow[];
  cells: MoneyGridCell[];
  action: (prev: SalesState, formData: FormData) => Promise<SalesState>;
  saveLabel: string;
  /** The sentence above the table. */
  note: ReactNode;
  /** What to say when there are no rows yet. */
  empty: string;
  /** Published months, whose cells are read-only. */
  lockedMonths: string[];
  /** Whether the month being entered is itself published. */
  locked: boolean;
  /**
   * Months this grid cannot take a figure for, drawn blank with a word
   * under the heading saying where that figure goes instead.
   *
   * What came in cannot run ahead of the month being entered; a forecast
   * is the one grid that is supposed to.
   */
  ahead?: (month: string) => boolean;
  aheadLabel?: string;
  /** An id for the table, so a note elsewhere can link to it. */
  anchor?: string;
  /** Buttons that belong to the page rather than to this grid. */
  extraToggles?: ReactNode;
}

export function MoneyGrid(props: MoneyGridProps) {
  const [state, action] = useActionState<SalesState, FormData>(props.action, null);
  const money = (v: number | null) => formatValue(v, "currency", props.currency);

  const year = yearOf(props.month);
  const [whole, setWhole] = useState(false);
  const months = whole ? year : monthsToShow(year, props.cells, props.month);

  const ahead = (m: string) => props.ahead?.(m) ?? false;
  const entered = year.filter((m) => !ahead(m));

  const [typed, setTyped] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      props.cells.map((c) => [`${c.rowId}|${c.month}`, toInputValue(c.amount)]),
    ),
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
      if (props.lockedMonths.includes(month) || ahead(month)) continue;
      next[`${rowId}|${month}`] = toInputValue(amount);
    }
    setTyped(next);
    return true;
  };

  const rowTotal = (rowId: string) => entered.reduce((t, m) => t + (read(rowId, m) ?? 0), 0);
  const columnTotal = (month: string) =>
    ahead(month) ? 0 : props.rows.reduce((t, r) => t + (read(r.id, month) ?? 0), 0);

  if (props.rows.length === 0) {
    return (
      <Card className="p-5 sm:p-6">
        <SectionTitle>{props.title}</SectionTitle>
        <p className="text-small text-ink/60">{props.empty}</p>
      </Card>
    );
  }

  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle aside={props.month.slice(0, 4)}>{props.title}</SectionTitle>

      <p className="mb-4 text-small text-ink/70">{props.note}</p>

      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="workspace_id" value={props.workspaceId} />
        {/* Which month is being entered, so the save can refuse money
            received in a month that has not happened yet. */}
        <input type="hidden" name="month" value={props.month} />

        {/* The sticky first column is what makes a year readable on a
            phone: the names stay put and the months scroll under them.

            **`relative` is load-bearing** (Dom, 13 November: a strip of
            bare background down the right of the phone screenshot). Every
            cell carries an `sr-only` label, which is `position:
            absolute` — and an absolutely positioned element is clipped by
            an ancestor's overflow only when that ancestor is its
            containing block. Without this, twelve columns of invisible
            1px labels sat in page coordinates out past the right edge and
            dragged the whole document sideways with them. */}
        <div className="relative -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          <table id={props.anchor} className="w-full border-collapse text-small">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card py-2 pr-3 text-left text-caption font-medium uppercase tracking-wide text-ink/60">
                  Row
                </th>
                {months.map((m) => (
                  <th
                    key={m}
                    className={`${MONTH_COL} py-2 text-caption font-medium uppercase tracking-wide ${
                      m === props.month ? "text-ink" : "text-ink/55"
                    }`}
                  >
                    {shortMonth(m)}
                    {props.lockedMonths.includes(m) ? (
                      <span className="block text-[0.6rem] font-normal normal-case text-ink/45">
                        published
                      </span>
                    ) : ahead(m) ? (
                      <span className="block text-[0.6rem] font-normal normal-case text-ink/45">
                        {props.aheadLabel ?? "later"}
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
                      <td
                        key={m}
                        className={`${MONTH_COL} py-1.5 ${m === props.month ? "bg-cream-deep" : ""}`}
                      >
                        {ahead(m) ? (
                          // As wide as the input it stands in for, so the
                          // column does not change size on the grid that
                          // cannot take a figure.
                          <span className="inline-block w-20 py-1.5 font-mono text-small text-ink/30">
                            &mdash;
                          </span>
                        ) : (
                          <>
                            {/* **The id carries the grid, the name does not.**
                                The grids draw the same rows and the same
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
                          </>
                        )}
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
                    className={`${MONTH_COL} py-2.5 font-mono tabular-nums text-ink ${
                      m === props.month ? "bg-cream-deep" : ""
                    }`}
                  >
                    {money(columnTotal(m) || null)}
                  </td>
                ))}
                <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-ink">
                  {money(entered.reduce((t, m) => t + columnTotal(m), 0) || null)}
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
          {props.extraToggles}
        </div>

        <FormMessage error={state?.error} notice={state?.notice} />
        {props.locked ? (
          <p className="text-caption text-ink/60">
            {monthLabel(props.month)} is published, so its column is fixed. Unpublish it to
            make changes.
          </p>
        ) : null}
        {/* **The button says its own grid's name back.** Grids of
            identical shape sit one above the other, so "Save" on any of
            them would be a button you have to work out. */}
        <SubmitButton full={false}>{props.saveLabel}</SubmitButton>
      </form>
    </Card>
  );
}
