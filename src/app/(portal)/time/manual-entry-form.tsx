"use client";

import { useActionState, useState } from "react";

import { addManualEntry, type TimerState } from "@/lib/timer/actions";
import type { TimeCategory } from "@/lib/timer/queries";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

/**
 * Logging after the fact, for when someone forgot to start the timer. Collapsed
 * by default: live tracking is the intended path (§4), and a form sitting open
 * invites reconstructing the day from memory, which is exactly what the timer
 * exists to replace.
 */
export function ManualEntryForm({
  categories,
  today,
}: {
  categories: TimeCategory[];
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<TimerState, FormData>(
    addManualEntry,
    null,
  );

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Add time manually
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="manual_category"
          className="text-small font-medium text-navy"
        >
          Category
        </label>
        <select
          id="manual_category"
          name="category_slug"
          defaultValue=""
          required
          className="w-full rounded-md border border-navy/15 bg-white px-3 py-2.5 text-body text-navy"
        >
          <option value="" disabled>
            Choose one
          </option>
          {categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" name="date" type="date" defaultValue={today} />
        <Field label="From" name="start_time" type="time" />
        <Field label="To" name="end_time" type="time" />
      </div>

      <Field
        label="Note"
        name="note"
        required={false}
        hint="Optional — what it was, if it helps you later."
      />

      <FormMessage error={state?.error} />

      <div className="flex items-center gap-3">
        <SubmitButton full={false}>Save entry</SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-small text-navy/60 underline underline-offset-4 transition hover:text-navy"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
