"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { formatValue, fromInputValue, toInputValue } from "@/lib/reporting/format";
import {
  clientProfitability,
  effectiveRate,
  type ActualCell,
  type SalesRow,
} from "@/lib/reporting/ledger";
import { monthLabel } from "@/lib/reporting/months";
import type { SalesState } from "@/lib/reporting/sales-actions";
import { saveClientHours, saveStaff } from "@/lib/reporting/staff-actions";
import type { StaffHours, StaffMember } from "@/lib/reporting/staff-queries";

/**
 * Her Client Profitability tab: hours against a client, and what that
 * client was worth.
 *
 * **Clients down, people across, one month.** The other three grids on
 * this screen are rows against months; this one cannot be, because the
 * third dimension is who did the work. So it is the month being entered,
 * which is also the month somebody is sitting down to write up.
 *
 * **Nothing here is Allegro's time** (§1). It is the member's own team
 * and their own rates, so they can see what serving a client costs them.
 *
 * What the client paid is not asked for: it is in the Actual grid
 * already, and asking twice is how two answers to one question get
 * stored (§9).
 */

export interface HoursGridProps {
  workspaceId: string;
  month: string;
  currency: string;
  /** Every sales row; only the client ones get hours. */
  rows: SalesRow[];
  actuals: ActualCell[];
  staff: StaffMember[];
  hours: StaffHours[];
  locked: boolean;
}

export function HoursGrid(props: HoursGridProps) {
  const clients = props.rows.filter((r) => r.rowType === "client");
  const team = props.staff.filter((s) => s.active);

  return (
    <div className="flex flex-col gap-6">
      {clients.length > 0 && team.length > 0 ? (
        <>
          <Hours {...props} clients={clients} team={team} />
          <Profitability {...props} />
        </>
      ) : null}
      <StaffSetup {...props} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hours: clients down, people across
// ---------------------------------------------------------------------------

function Hours(props: HoursGridProps & { clients: SalesRow[]; team: StaffMember[] }) {
  const [state, action] = useActionState<SalesState, FormData>(saveClientHours, null);
  const [typed, setTyped] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      props.hours
        .filter((h) => h.month === props.month)
        .map((h) => [`${h.salesRowId}|${h.staffId}`, toInputValue(h.hours)]),
    ),
  );

  const read = (rowId: string, staffId: string) =>
    fromInputValue(typed[`${rowId}|${staffId}`] ?? "");
  const rowTotal = (rowId: string) =>
    props.team.reduce((t, s) => t + (read(rowId, s.id) ?? 0), 0);
  const columnTotal = (staffId: string) =>
    props.clients.reduce((t, r) => t + (read(r.id, staffId) ?? 0), 0);

  const hours = (v: number) => (v === 0 ? "—" : `${Number(v.toFixed(2))}`);

  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle aside={monthLabel(props.month)}>Hours on each client</SectionTitle>
      <p className="mb-4 text-small text-ink/70">
        Who worked on whom this month. What each client paid is already on the Actual
        grid, so it is not asked for again.
      </p>

      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="workspace_id" value={props.workspaceId} />
        <input type="hidden" name="month" value={props.month} />

        <div className="relative -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          <table className="w-full border-collapse text-small">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card py-2 pr-3 text-left text-caption font-medium uppercase tracking-wide text-ink/60">
                  Client
                </th>
                {props.team.map((person) => (
                  <th
                    key={person.id}
                    className="px-1.5 py-2 text-right text-caption font-medium uppercase tracking-wide text-ink/60"
                  >
                    {person.name}
                    <span className="block text-[0.6rem] font-normal normal-case text-ink/45">
                      {formatValue(person.hourlyRate, "currency", props.currency)}/h
                    </span>
                  </th>
                ))}
                <th className="py-2 pl-3 text-right text-caption font-medium uppercase tracking-wide text-ink/60">
                  Hours
                </th>
              </tr>
            </thead>
            <tbody>
              {props.clients.map((client) => (
                <tr key={client.id} className="border-t border-ink/8">
                  <th className="sticky left-0 z-10 max-w-[9rem] truncate bg-card py-2 pr-3 text-left font-medium text-ink">
                    {client.name}
                  </th>
                  {props.team.map((person) => (
                    <td key={person.id} className="px-1.5 py-1.5 text-right">
                      <label className="sr-only" htmlFor={`hours:${client.id}:${person.id}`}>
                        {`${person.name} on ${client.name}, hours`}
                      </label>
                      <input
                        id={`hours:${client.id}:${person.id}`}
                        name={`hours:${client.id}:${person.id}`}
                        type="number"
                        step="0.25"
                        min="0"
                        inputMode="decimal"
                        disabled={props.locked}
                        value={typed[`${client.id}|${person.id}`] ?? ""}
                        onChange={(e) =>
                          setTyped((was) => ({
                            ...was,
                            [`${client.id}|${person.id}`]: e.target.value,
                          }))
                        }
                        className="w-20 rounded-lg border border-ink/12 bg-cream-deep px-2 py-1.5 text-right text-small tabular-nums text-ink outline-none transition focus:border-orange focus:bg-card focus:ring-2 focus:ring-orange/30 disabled:opacity-50"
                      />
                    </td>
                  ))}
                  <td className="py-2 pl-3 text-right font-mono tabular-nums text-ink">
                    {hours(rowTotal(client.id))}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-ink/15">
                <th className="sticky left-0 z-10 bg-card py-2.5 pr-3 text-left text-caption font-medium uppercase tracking-wide text-ink/60">
                  Total
                </th>
                {props.team.map((person) => (
                  <td
                    key={person.id}
                    className="px-1.5 py-2.5 text-right font-mono tabular-nums text-ink"
                  >
                    {hours(columnTotal(person.id))}
                  </td>
                ))}
                <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-ink">
                  {hours(props.clients.reduce((t, r) => t + rowTotal(r.id), 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <FormMessage error={state?.error} notice={state?.notice} />
        {props.locked ? (
          <p className="text-caption text-ink/60">
            {monthLabel(props.month)} is published, so its hours are fixed. Unpublish it to
            make changes.
          </p>
        ) : null}
        <SubmitButton full={false}>Save the hours</SubmitButton>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// What each client was worth
// ---------------------------------------------------------------------------

function Profitability(props: HoursGridProps) {
  const money = (v: number | null) => formatValue(v, "currency", props.currency);
  const rows = clientProfitability(props.rows, props.actuals, props.hours, props.month);

  if (rows.length === 0) return null;

  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle aside={monthLabel(props.month)}>What each client was worth</SectionTitle>
      <p className="mb-4 text-small text-ink/70">
        What they paid, against what their work cost at the rates saved with those hours.
        A client with neither money nor hours this month is not on the list.
      </p>

      <div className="relative -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <table className="w-full border-collapse text-small">
          <thead>
            <tr className="text-caption uppercase tracking-wide text-ink/60">
              <th className="py-2 pr-3 text-left font-medium">Client</th>
              <th className="px-3 py-2 text-right font-medium">Paid</th>
              <th className="px-3 py-2 text-right font-medium">Hours</th>
              <th className="px-3 py-2 text-right font-medium">Staff cost</th>
              <th className="px-3 py-2 text-right font-medium">Profit</th>
              <th className="px-3 py-2 text-right font-medium">Margin</th>
              <th className="py-2 pl-3 text-right font-medium">Per hour</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.salesRowId} className="border-t border-ink/8">
                <th className="max-w-[10rem] truncate py-2.5 pr-3 text-left font-medium text-ink">
                  {row.name}
                </th>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-ink">
                  {money(row.paid)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-ink">
                  {formatValue(row.hours, "hours", props.currency)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-ink">
                  {money(row.staffCost)}
                </td>
                <td
                  className={`px-3 py-2.5 text-right font-mono tabular-nums ${
                    (row.profit ?? 0) < 0 ? "text-orange" : "text-ink"
                  }`}
                >
                  {money(row.profit)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-ink">
                  {formatValue(row.margin, "percent", props.currency)}
                </td>
                <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-ink">
                  {money(effectiveRate(row.paid, row.hours))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Who does the work
// ---------------------------------------------------------------------------

function StaffSetup(props: HoursGridProps) {
  const [state, action] = useActionState<SalesState, FormData>(saveStaff, null);
  const [showList, setShowList] = useState(props.staff.length === 0);

  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle>Who does the work</SectionTitle>
      <p className="mb-4 text-small text-ink/70">
        Your own team and what their time costs.{" "}
        <strong className="font-medium text-ink">Changing a rate is forward-looking</strong>{" "}
        — the hours already entered keep the rate they were saved with, so a pay rise
        cannot rewrite a month that has gone out.
      </p>

      {props.staff.length > 0 ? (
        <Button
          variant="secondary"
          size="sm"
          type="button"
          className="mb-5"
          onClick={() => setShowList((on) => !on)}
        >
          {showList ? "Hide the team" : `Change a rate, or retire somebody (${props.staff.length})`}
        </Button>
      ) : null}

      {props.staff.length > 0 && showList ? (
        <ul className="mb-5 flex flex-col divide-y divide-ink/8">
          {props.staff.map((person) => (
            <StaffRow key={person.id} person={person} {...props} />
          ))}
        </ul>
      ) : null}

      {showList || props.staff.length === 0 ? (
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="workspace_id" value={props.workspaceId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" name="name" id="staff-name" required maxLength={120} />
            <Field
              label="Hourly rate"
              name="hourly_rate"
              id="staff-rate"
              type="number"
              step="0.01"
              min="0.01"
              required
              inputMode="decimal"
              hint="What an hour of their time costs the business."
            />
          </div>
          <FormMessage error={state?.error} notice={state?.notice} />
          <SubmitButton full={false}>Add them</SubmitButton>
        </form>
      ) : null}
    </Card>
  );
}

function StaffRow({ person, workspaceId }: HoursGridProps & { person: StaffMember }) {
  const [state, action] = useActionState<SalesState, FormData>(saveStaff, null);

  return (
    <li className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 py-3 first:pt-0">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="workspace_id" value={workspaceId} />
        <input type="hidden" name="staff_id" value={person.id} />
        <div className="w-40">
          <Field
            key={person.name}
            label={`Name of ${person.name}`}
            hideLabel
            name="name"
            id={`staff-name:${person.id}`}
            defaultValue={person.name}
            maxLength={120}
            className="!py-1.5 text-small"
          />
        </div>
        <div className="w-28">
          <Field
            key={person.hourlyRate}
            label={`Hourly rate for ${person.name}`}
            hideLabel
            name="hourly_rate"
            id={`staff-rate:${person.id}`}
            type="number"
            step="0.01"
            min="0.01"
            inputMode="decimal"
            defaultValue={person.hourlyRate}
            className="!py-1.5 text-small"
          />
        </div>
        {/* A rate is a decision, not a correction, so this one keeps its
            button — it is the change the sentence above is about. */}
        <SubmitButton full={false} variant="ghost" size="sm">
          Save
        </SubmitButton>
        <FormMessage error={state?.error} notice={state?.notice} />
      </form>

      <form action={action}>
        <input type="hidden" name="workspace_id" value={workspaceId} />
        <input type="hidden" name="staff_id" value={person.id} />
        <input type="hidden" name="name" value={person.name} />
        <input type="hidden" name="retire" value={person.active ? "yes" : "no"} />
        <SubmitButton full={false} variant="ghost" size="sm">
          {person.active ? "Retire" : "Put back"}
        </SubmitButton>
      </form>
    </li>
  );
}
