"use client";

import { useActionState, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Badge, Card, Eyebrow, SectionTitle, Stat } from "@/components/ui/card";
import { Field, FormMessage, Select, SubmitButton } from "@/components/ui/form";
import { formatValue, toInputValue } from "@/lib/reporting/format";
import {
  cashIn,
  instalmentPlan,
  monthsFrom,
  outstandingBy,
  recurringSplit,
  salesIn,
  unscheduledOf,
  type Billing,
  type Sale,
  type SalePayment,
  type SalesRow,
} from "@/lib/reporting/ledger";
import { monthLabel } from "@/lib/reporting/months";
import {
  cancelSale,
  retireSalesRow,
  saveSale,
  savePaymentsReceived,
  saveSalesRow,
  type SalesState,
} from "@/lib/reporting/sales-actions";

/**
 * Financials, the sales half: Nina's own tracker as a screen.
 *
 * Her sheet is one row per offer or per customer, twelve month columns and
 * a year total, with instalments written across the row as amounts. This
 * is built to match, because the shape is the part she already knows how
 * to read — and underneath it a sale is one record with its instalments
 * hanging off it, so the published-month lock has something month-shaped
 * to hold still.
 *
 * **Sales and cash are different questions and this screen keeps them
 * apart**, which is the whole reason it exists. A £2,000 course sold in
 * September as four £500s is £2,000 of September sales and £500 of
 * September cash, and before this there was one revenue figure and
 * nobody had to say which of the two it was.
 *
 * Three jobs, in the order somebody actually does them: record what sold,
 * tick off what came in, then look at the year.
 */

export interface SalesGridProps {
  workspaceId: string;
  /** The month being entered. */
  month: string;
  currency: string;
  rows: SalesRow[];
  sales: Sale[];
  payments: SalePayment[];
  /** The client's offers, for the optional link on an offer row. */
  offers: { id: string; name: string }[];
  /** Published months, whose cells are read-only. */
  lockedMonths: string[];
  /** Whether the month being entered is itself published. */
  locked: boolean;
  /**
   * The first month that no published month sits at or after.
   *
   * What the cancellation field offers, because the database refuses one
   * dated at or before a published month — and a form that offers a value
   * it knows will be refused is a form that teaches somebody the screen is
   * broken.
   */
  openMonth: string | null;
}

const BILLING_LABEL: Record<Billing, string> = {
  one_off: "One-off",
  monthly: "Monthly",
  annual: "Annual",
};

/** Jan–Dec of the year the month sits in, which is how her grid reads. */
const yearOf = (month: string) => monthsFrom(`${month.slice(0, 4)}-01-01`, 12);

const shortMonth = (month: string) => monthLabel(month).split(" ")[0].slice(0, 3);

export function SalesGrid(props: SalesGridProps) {
  const { currency } = props;
  const money = (v: number | null) => formatValue(v, "currency", currency);

  const live = props.rows.filter((r) => r.active);
  const retired = props.rows.filter((r) => !r.active);
  const thisMonth = props.sales.filter((s) => s.month === props.month);

  const split = recurringSplit(props.sales, props.payments, props.month);

  /** Which sale the editor is open on: an id, "new", or nothing. */
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5 sm:p-6">
        <SectionTitle aside={monthLabel(props.month)}>This month</SectionTitle>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat
            label="Sold"
            value={money(salesIn(props.sales, props.month))}
            detail="What they sold, whatever has been paid"
          />
          <Stat
            label="Cash in"
            value={money(cashIn(props.payments, props.month))}
            detail="What arrived, whenever it was sold"
          />
          <Stat
            label="Still owed"
            value={money(outstandingBy(props.payments, props.month))}
            detail="Due by the end of the month and not in"
          />
          <Stat
            label="Recurring"
            value={money(split.combined)}
            detail="Monthly and annual together"
          />
        </div>
      </Card>

      <SoldThisMonth
        {...props}
        sales={thisMonth}
        editing={editing}
        onEdit={setEditing}
        money={money}
      />

      <CashThisMonth {...props} money={money} />

      <TheYear {...props} money={money} />

      <RowSetup {...props} live={live} retired={retired} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// What sold this month
// ---------------------------------------------------------------------------

/**
 * **The card owns the actions, not the forms inside it.**
 *
 * Found in the browser, 12 November. A `FormMessage` in the editor was
 * unmounted by the very save it was reporting — the editor closes on
 * success — so a recorded sale said nothing at all, and the cancellation
 * had the same hole: its form swaps for the other branch the moment it
 * lands. `useActionState` lives on the one component that stays put, and
 * the notice with it.
 */
function SoldThisMonth({
  editing,
  onEdit,
  money,
  ...props
}: SalesGridProps & {
  editing: string | null;
  onEdit: (id: string | null) => void;
  money: (v: number | null) => string;
}) {
  const [saved, saveAction] = useActionState<SalesState, FormData>(saveSale, null);
  const [cancelled, cancelAction] = useActionState<SalesState, FormData>(cancelSale, null);
  const nameOf = (id: string) => props.rows.find((r) => r.id === id)?.name ?? "A row";
  const live = props.rows.filter((r) => r.active);

  // A save that landed closes the editor; a refusal leaves it open, with
  // the figures still there to correct. One new state object per submit,
  // so this fires once each time rather than on every render.
  useEffect(() => {
    if (saved && !saved.error) onEdit(null);
    // onEdit is a setState, stable for the life of the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle
        aside={props.locked ? "Published" : undefined}
      >{`Sold in ${monthLabel(props.month)}`}</SectionTitle>

      {props.locked ? (
        <p className="mb-4 text-small text-ink/70">
          This month is published, so what was sold is fixed. If a customer has stopped
          paying since, that still goes on the record — date it in a month that is still
          open.
        </p>
      ) : null}

      <div className="mb-4 flex flex-col gap-2 empty:mb-0">
        <FormMessage error={saved?.error} notice={saved?.notice} />
        <FormMessage error={cancelled?.error} notice={cancelled?.notice} />
      </div>

      {props.sales.length === 0 ? (
        <p className="text-small text-ink/60">
          Nothing recorded for this month yet. A sale is what was sold, counted here
          whatever the payment plan — the instalments go in the months they are due.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-ink/8">
          {props.sales.map((sale) => {
            const instalments = props.payments.filter(
              (p) => p.saleId === sale.id && p.cancelledOn === null,
            );
            const left = unscheduledOf(sale, props.payments);
            return (
              <li key={sale.id} className="flex flex-col gap-3 py-4 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <p className="text-body font-medium text-ink">{nameOf(sale.salesRowId)}</p>
                    <p className="mt-0.5 text-caption text-ink/60">
                      {instalments.length === 0
                        ? "No instalments scheduled"
                        : instalments.length === 1
                          ? `One payment, ${shortMonth(instalments[0].dueMonth)}`
                          : `${instalments.length} payments, ${shortMonth(instalments[0].dueMonth)}–${shortMonth(instalments[instalments.length - 1].dueMonth)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={sale.billing === "one_off" ? "neutral" : "sky"}>
                      {BILLING_LABEL[sale.billing]}
                    </Badge>
                    <p className="font-mono text-body text-ink">{money(sale.totalValue)}</p>
                  </div>
                </div>

                {sale.cancelledOn ? (
                  <p className="text-caption text-ink/60">
                    Cancelled {monthLabel(sale.cancelledOn.slice(0, 7) + "-01")}, and kept
                    on the record: {monthLabel(sale.month)} sold it, and the month they
                    stopped is where it stops counting.
                  </p>
                ) : left !== null ? (
                  // Dom, 12 November. Not something the database refuses —
                  // half a payment plan is a normal thing to be looking at
                  // mid-typing — but money that will quietly never arrive.
                  <p className="text-caption text-orange">
                    {left > 0
                      ? `${money(left)} not yet scheduled into a month.`
                      : `${money(Math.abs(left))} more scheduled than the sale is worth.`}
                  </p>
                ) : null}

                {/* **The cancellation stays available on a published
                    month**, and that is the point of the guard behind it:
                    a customer who stops paying in November is news about
                    November, not a change to September. Editing what was
                    sold is the part September fixes. */}
                <div className="flex flex-wrap gap-2">
                  {!props.locked ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onEdit(editing === sale.id ? null : sale.id)}
                    >
                      {editing === sale.id ? "Close" : "Edit"}
                    </Button>
                  ) : null}
                  <CancelSale {...props} sale={sale} action={cancelAction} />
                </div>

                {editing === sale.id ? (
                  <SaleEditor
                    {...props}
                    sale={sale}
                    rows={live}
                    action={saveAction}
                    onDone={() => onEdit(null)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {!props.locked ? (
        <div className="mt-5">
          {editing === "new" ? (
            <SaleEditor
              {...props}
              sale={null}
              rows={live}
              action={saveAction}
              onDone={() => onEdit(null)}
            />
          ) : (
            <Button variant="secondary" onClick={() => onEdit("new")} disabled={live.length === 0}>
              Record a sale
            </Button>
          )}
          {live.length === 0 ? (
            <p className="mt-2 text-caption text-ink/60">
              Add a row first — an offer you sell, or a client by name if they are on a
              retainer or a bespoke package.
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The editor: a sale and its schedule, in one save
// ---------------------------------------------------------------------------

function SaleEditor({
  sale,
  rows,
  action,
  onDone,
  ...props
}: SalesGridProps & {
  sale: Sale | null;
  rows: SalesRow[];
  action: (formData: FormData) => void;
  onDone: () => void;
}) {

  const existing = useMemo(
    () => (sale ? props.payments.filter((p) => p.saleId === sale.id) : []),
    [sale, props.payments],
  );

  const months = monthsFrom(props.month, 12);
  const [total, setTotal] = useState(toInputValue(sale?.totalValue ?? null));
  const [count, setCount] = useState("1");
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      months.map((m) => [
        m,
        toInputValue(existing.find((p) => p.dueMonth === m)?.amount ?? null),
      ]),
    ),
  );

  /** The suggestion, which every cell stays editable after. */
  const fill = () => {
    const value = Number(total);
    const n = Number(count);
    if (!Number.isFinite(value) || !Number.isInteger(n) || n < 1) return;
    const plan = instalmentPlan(value, Math.min(n, 12), props.month);
    // Replaces the lot rather than merging: "spread over three" means
    // three, and a leftover amount from a five-month plan would make the
    // schedule disagree with the number that was just typed.
    setAmounts({
      ...Object.fromEntries(months.map((m) => [m, ""])),
      ...Object.fromEntries(plan.map((p) => [p.month, toInputValue(p.amount)])),
    });
  };

  const scheduled = months.reduce((sum, m) => sum + (Number(amounts[m]) || 0), 0);
  const left = (Number(total) || 0) - scheduled;

  return (
    <form action={action} className="mt-2 flex flex-col gap-4 rounded-2xl bg-cream-deep p-4">
      <input type="hidden" name="workspace_id" value={props.workspaceId} />
      <input type="hidden" name="month" value={props.month} />
      {sale ? <input type="hidden" name="sale_id" value={sale.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Select label="Row" name="sales_row_id" defaultValue={sale?.salesRowId ?? ""} required>
          <option value="" disabled>
            Choose…
          </option>
          {rows.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </Select>

        <Field
          label="What it is worth"
          name="total_value"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          required
          value={total}
          onChange={(e) => setTotal(e.target.value)}
        />

        <Select
          label="Billing"
          name="billing"
          defaultValue={sale?.billing ?? "one_off"}
          hint="A payment plan is still one-off. Monthly and annual are what recurring revenue is drawn from."
        >
          <option value="one_off">One-off</option>
          <option value="monthly">Monthly</option>
          <option value="annual">Annual</option>
        </Select>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-32">
          <Field
            label="Spread over"
            name="instalment_count"
            type="number"
            min="1"
            max="12"
            inputMode="numeric"
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </div>
        <Button variant="secondary" size="sm" onClick={fill} type="button">
          Fill the months
        </Button>
        <p className="text-caption text-ink/60">
          A suggestion — every amount below stays yours to change.
        </p>
      </div>

      <div>
        <Eyebrow className="mb-2">When it is due</Eyebrow>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {months.map((m) => {
            const was = existing.find((p) => p.dueMonth === m);
            const monthLocked = props.lockedMonths.includes(m);
            return (
              <div key={m} className="flex flex-col gap-1.5">
                <label
                  className="text-caption font-medium text-ink/70"
                  htmlFor={`due:${m}`}
                >
                  {monthLabel(m)}
                  {monthLocked ? " · published" : ""}
                </label>
                <input
                  id={`due:${m}`}
                  name={`due:${m}`}
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  disabled={monthLocked}
                  value={amounts[m] ?? ""}
                  onChange={(e) => setAmounts((was2) => ({ ...was2, [m]: e.target.value }))}
                  className="w-full rounded-xl border border-ink/12 bg-cream-deep px-3 py-2 text-body text-ink outline-none transition focus:border-orange focus:bg-card focus:ring-2 focus:ring-orange/30 disabled:opacity-50"
                />
                {amounts[m] ? (
                  <label className="flex items-center gap-2 text-caption text-ink/70">
                    <input
                      type="checkbox"
                      name={`paid:${m}`}
                      // The month it actually arrived, so re-saving a sale
                      // cannot quietly move a late payment back to its due
                      // month.
                      value={was?.receivedMonth ?? m}
                      defaultChecked={was?.receivedMonth != null}
                      className="size-4 accent-orange"
                    />
                    Paid
                  </label>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-caption text-ink/70">
        {left === 0
          ? "The schedule adds up."
          : left > 0
            ? `${formatValue(left, "currency", props.currency)} still to put in a month.`
            : `${formatValue(Math.abs(left), "currency", props.currency)} more than the sale is worth.`}
      </p>

      <div className="flex gap-2">
        <SubmitButton full={false}>{sale ? "Save the sale" : "Record it"}</SubmitButton>
        <Button variant="ghost" type="button" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function CancelSale({
  sale,
  action,
  ...props
}: SalesGridProps & { sale: Sale; action: (formData: FormData) => void }) {
  const [open, setOpen] = useState(false);

  if (sale.cancelledOn) {
    return (
      <form action={action} className="flex items-center gap-2">
        <input type="hidden" name="workspace_id" value={props.workspaceId} />
        <input type="hidden" name="sale_id" value={sale.id} />
        <input type="hidden" name="undo" value="true" />
        <SubmitButton full={false}>Not cancelled after all</SubmitButton>
      </form>
    );
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        They stopped
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="workspace_id" value={props.workspaceId} />
      <input type="hidden" name="sale_id" value={sale.id} />
      <div className="w-44">
        <Field
          label="Month they stopped"
          name="cancelled_on"
          type="month"
          defaultValue={(props.openMonth ?? props.month).slice(0, 7)}
          required
          hint="Has to be a month that is not published yet."
        />
      </div>
      <SubmitButton full={false}>Mark it</SubmitButton>
      <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// The month's cash
// ---------------------------------------------------------------------------

function CashThisMonth({
  money,
  ...props
}: SalesGridProps & { money: (v: number | null) => string }) {
  const [state, action] = useActionState<SalesState, FormData>(savePaymentsReceived, null);

  // Due this month, or paid this month whenever it was due. The second half
  // matters: an instalment paid early belongs in this month's cash.
  const cells = props.payments
    .filter(
      (p) =>
        p.cancelledOn === null &&
        (p.dueMonth === props.month || p.receivedMonth === props.month),
    )
    .sort((a, b) => a.dueMonth.localeCompare(b.dueMonth));

  const saleOf = (id: string) => props.sales.find((s) => s.id === id);
  const nameOf = (saleId: string) => {
    const sale = saleOf(saleId);
    return props.rows.find((r) => r.id === sale?.salesRowId)?.name ?? "A row";
  };

  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle aside={money(cashIn(props.payments, props.month))}>
        {`Money in during ${monthLabel(props.month)}`}
      </SectionTitle>

      {cells.length === 0 ? (
        <p className="text-small text-ink/60">
          Nothing due or paid this month. Instalments appear here in the month they are
          scheduled for.
        </p>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="workspace_id" value={props.workspaceId} />
          <input type="hidden" name="month" value={props.month} />
          <ul className="flex flex-col divide-y divide-ink/8">
            {cells.map((p) => (
              <li
                key={`${p.saleId}|${p.dueMonth}`}
                className="flex items-center justify-between gap-4 py-3 first:pt-0"
              >
                <label className="flex min-w-0 items-center gap-3">
                  <input
                    type="checkbox"
                    name={`cell:${p.saleId}:${p.dueMonth}`}
                    defaultChecked={p.receivedMonth !== null}
                    disabled={props.locked}
                    className="size-4 shrink-0 accent-orange"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-body text-ink">
                      {nameOf(p.saleId)}
                    </span>
                    <span className="block text-caption text-ink/60">
                      Due {monthLabel(p.dueMonth)}
                      {p.receivedMonth && p.receivedMonth !== p.dueMonth
                        ? ` · paid ${monthLabel(p.receivedMonth)}`
                        : ""}
                    </span>
                  </span>
                </label>
                <span className="shrink-0 font-mono text-body text-ink">{money(p.amount)}</span>
              </li>
            ))}
          </ul>
          <FormMessage error={state?.error} notice={state?.notice} />
          {props.locked ? (
            <p className="text-caption text-ink/60">
              This month is published, so its cash is fixed. Unpublish it to make changes.
            </p>
          ) : (
            <SubmitButton full={false}>Save what came in</SubmitButton>
          )}
        </form>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The year, which is the shape she already reads
// ---------------------------------------------------------------------------

function TheYear({
  money,
  ...props
}: SalesGridProps & { money: (v: number | null) => string }) {
  const months = yearOf(props.month);
  const live = props.rows.filter((r) => r.active);
  const shown = live.length > 0 ? live : props.rows;

  /** Every live instalment, by row and by month. */
  const cell = (rowId: string, month: string) => {
    const saleIds = new Set(
      props.sales.filter((s) => s.salesRowId === rowId).map((s) => s.id),
    );
    const mine = props.payments.filter(
      (p) => p.cancelledOn === null && saleIds.has(p.saleId) && p.dueMonth === month,
    );
    if (mine.length === 0) return null;
    return {
      amount: mine.reduce((t, p) => t + p.amount, 0),
      allIn: mine.every((p) => p.receivedMonth !== null),
    };
  };

  const rowTotal = (rowId: string) =>
    months.reduce((t, m) => t + (cell(rowId, m)?.amount ?? 0), 0);
  const columnTotal = (month: string) =>
    shown.reduce((t, r) => t + (cell(r.id, month)?.amount ?? 0), 0);

  if (shown.length === 0) return null;

  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle aside={props.month.slice(0, 4)}>The year</SectionTitle>
      <p className="mb-4 text-caption text-ink/60">
        What is due in each month, and a tick when it is all in. Scroll sideways for the
        rest of the year.
      </p>

      {/* The sticky first column is what makes a twelve-month grid readable on
          a phone: the names stay put and the months scroll under them. */}
      <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[46rem] border-collapse text-small">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card py-2 pr-3 text-left text-caption font-medium uppercase tracking-wide text-ink/60">
                Row
              </th>
              {months.map((m) => (
                <th
                  key={m}
                  className={`px-2 py-2 text-right text-caption font-medium uppercase tracking-wide ${
                    m === props.month ? "text-ink" : "text-ink/55"
                  }`}
                >
                  {shortMonth(m)}
                </th>
              ))}
              <th className="pl-3 py-2 text-right text-caption font-medium uppercase tracking-wide text-ink/60">
                Year
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.id} className="border-t border-ink/8">
                <th className="sticky left-0 z-10 max-w-[10rem] truncate bg-card py-2.5 pr-3 text-left font-medium text-ink">
                  {row.name}
                  {!row.active ? <span className="text-ink/50"> · retired</span> : null}
                </th>
                {months.map((m) => {
                  const value = cell(row.id, m);
                  return (
                    <td
                      key={m}
                      className={`px-2 py-2.5 text-right font-mono tabular-nums ${
                        m === props.month ? "bg-cream-deep" : ""
                      } ${value?.allIn ? "text-ink" : "text-ink/60"}`}
                    >
                      {value ? (
                        <span className="whitespace-nowrap">
                          {money(value.amount)}
                          {value.allIn ? (
                            <span className="ml-1 text-orange" aria-label="all in">
                              ✓
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-ink/30">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-ink">
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
                  className={`px-2 py-2.5 text-right font-mono tabular-nums text-ink ${
                    m === props.month ? "bg-cream-deep" : ""
                  }`}
                >
                  {money(columnTotal(m) || null)}
                </td>
              ))}
              <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-ink">
                {money(months.reduce((t, m) => t + columnTotal(m), 0) || null)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The rows down the left-hand side
// ---------------------------------------------------------------------------

function RowSetup({
  live,
  retired,
  ...props
}: SalesGridProps & { live: SalesRow[]; retired: SalesRow[] }) {
  const [state, action] = useActionState<SalesState, FormData>(saveSalesRow, null);
  const [rowType, setRowType] = useState<"offer" | "client">("offer");

  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle>Your rows</SectionTitle>
      <p className="mb-4 text-small text-ink/70">
        List your offers, or list a client by name if they&rsquo;re on a retainer or bespoke
        package.
      </p>

      {live.length > 0 || retired.length > 0 ? (
        <ul className="mb-5 flex flex-col divide-y divide-ink/8">
          {[...live, ...retired].map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-4 py-3 first:pt-0">
              <div className="min-w-0">
                <p className="truncate text-body text-ink">{row.name}</p>
                <p className="text-caption text-ink/60">
                  {row.rowType === "offer" ? "Offer" : "Client"}
                  {row.offerEntityId
                    ? ` · linked to ${props.offers.find((o) => o.id === row.offerEntityId)?.name ?? "an offer"}`
                    : ""}
                  {!row.active ? " · retired" : ""}
                </p>
              </div>
              <RetireRow {...props} row={row} />
            </li>
          ))}
        </ul>
      ) : null}

      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="workspace_id" value={props.workspaceId} />
        <div className="grid gap-4 sm:grid-cols-3">
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

function RetireRow({ row, ...props }: SalesGridProps & { row: SalesRow }) {
  const [state, action] = useActionState<SalesState, FormData>(retireSalesRow, null);
  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="workspace_id" value={props.workspaceId} />
      <input type="hidden" name="row_id" value={row.id} />
      <input type="hidden" name="name" value={row.name} />
      <input type="hidden" name="active" value={row.active ? "false" : "true"} />
      <SubmitButton full={false}>{row.active ? "Retire" : "Bring back"}</SubmitButton>
      <FormMessage error={state?.error} />
    </form>
  );
}
