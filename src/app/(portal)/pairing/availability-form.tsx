"use client";

import { useActionState } from "react";

import { saveAvailability, type PairingState } from "@/lib/pairing/actions";
import { SLOT_DAYS, SLOT_PERIODS } from "@/lib/pairing/slots";
import { FormMessage, SubmitButton } from "@/components/ui/form";

/**
 * The availability grid.
 *
 * Checkboxes in a real grid rather than a calendar picker: it has to be
 * completable in the ten seconds §9 implies when it asks for this to be folded
 * into the existing rhythm rather than become its own chore. Fifteen boxes, and
 * the whole thing works without JavaScript.
 */
export function AvailabilityForm({
  month,
  selected,
}: {
  month: string;
  selected: string[];
}) {
  const [state, formAction] = useActionState<PairingState, FormData>(
    saveAvailability,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="pairing_month" value={month} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[20rem] border-collapse">
          <thead>
            <tr>
              <th className="w-24" />
              {SLOT_PERIODS.map((period) => (
                <th
                  key={period.key}
                  scope="col"
                  className="pb-2 text-caption font-medium text-navy/60"
                >
                  {period.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOT_DAYS.map((day) => (
              <tr key={day.key}>
                <th
                  scope="row"
                  className="py-1 text-left text-small font-normal text-navy/70"
                >
                  {day.label}
                </th>
                {SLOT_PERIODS.map((period) => {
                  const slot = `${day.key}-${period.key}`;
                  return (
                    <td key={slot} className="py-1 text-center">
                      <label className="inline-flex cursor-pointer p-2">
                        <span className="sr-only">
                          {day.label} {period.label}
                        </span>
                        <input
                          type="checkbox"
                          name="slots"
                          value={slot}
                          defaultChecked={selected.includes(slot)}
                          className="size-5 accent-navy"
                        />
                      </label>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-caption text-navy/60">
        Tick anything that could work. Nothing ticked means you&rsquo;re sitting
        this month out, which is a fine answer.
      </p>

      <FormMessage error={state?.error} notice={state?.notice} />
      <SubmitButton full={false}>Save when I&rsquo;m free</SubmitButton>
    </form>
  );
}
