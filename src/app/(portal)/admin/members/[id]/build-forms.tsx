"use client";

import { useActionState } from "react";

import {
  addBuild,
  changeBuildRate,
  saveWriteUp,
  type HoursState,
} from "@/lib/admin/hours-actions";
import { Field, FormMessage, SubmitButton, TextArea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

export function AddBuildForm({
  memberId,
  today,
}: {
  memberId: string;
  today: string;
}) {
  const [state, formAction] = useActionState<HoursState, FormData>(addBuild, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="member_id" value={memberId} />
      <Field label="What got built" name="title" placeholder="Automated enquiry follow-up" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Hours saved per week"
          name="hours_per_week"
          type="number"
          step="0.25"
          min="0"
          placeholder="2.5"
          hint="From their tracked category hours, not a self-report."
        />
        <Field
          label="Earning from"
          name="effective_from"
          type="date"
          defaultValue={today}
          hint="Counts from the first qualifying week on or after this."
        />
      </div>
      <FormMessage error={state?.error} notice={state?.notice} />
      <SubmitButton full={false}>Add the build</SubmitButton>
    </form>
  );
}

/**
 * Revising and retiring, in one form.
 *
 * Both are the same move on the same dated history — one opens a new period,
 * the other just closes the current one — so they share a date field rather than
 * being two forms that could disagree about which date they meant.
 */
export function RateControls({
  packId,
  today,
  isRunning,
}: {
  packId: string;
  today: string;
  isRunning: boolean;
}) {
  const [state, formAction] = useActionState<HoursState, FormData>(
    changeBuildRate,
    null,
  );

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-3 border-t border-navy/10 pt-3">
      <input type="hidden" name="handover_pack_id" value={packId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="New rate"
          name="hours_per_week"
          type="number"
          step="0.25"
          min="0"
          required={false}
          placeholder="hrs/week"
        />
        <Field label="From" name="effective_date" type="date" defaultValue={today} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" name="intent" value="revise" size="sm" variant="secondary">
          Change the rate
        </Button>
        {isRunning ? (
          <Button type="submit" name="intent" value="retire" size="sm" variant="ghost">
            Retire this build
          </Button>
        ) : null}
      </div>

      <p className="text-caption text-navy/50">
        Weeks already earned never change — retiring stops it earning from that
        date, it doesn&rsquo;t take anything back.
      </p>

      <FormMessage error={state?.error} notice={state?.notice} />
    </form>
  );
}

/**
 * The write-up of a live build (§8).
 *
 * No draft state: saving publishes it to their Archivio. Nina works the wording
 * out with Claude outside the product, so the drafting has already happened by
 * the time anything is typed here — and a half-written note stored where the
 * member can technically read it is a worse answer than not storing one.
 *
 * The member can rephrase their own copy afterwards, which is §8's intent; a
 * trigger keeps that to the prose rather than the title or who signed it off.
 */
export function WriteUpForm({
  packId,
  body,
  isPublished,
}: {
  packId: string;
  body: string | null;
  isPublished: boolean;
}) {
  const [state, formAction] = useActionState<HoursState, FormData>(
    saveWriteUp,
    null,
  );

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2 border-t border-navy/10 pt-3">
      <input type="hidden" name="handover_pack_id" value={packId} />
      <TextArea
        label={isPublished ? "Write-up (published)" : "Write-up"}
        name="body"
        rows={4}
        required={false}
        defaultValue={body ?? ""}
        hint={
          isPublished
            ? "Saving again replaces what they can see."
            : "Nothing appears in their Archivio until this is saved."
        }
      />
      <FormMessage error={state?.error} notice={state?.notice} />
      <Button type="submit" size="sm" variant="secondary" className="self-start">
        {isPublished ? "Update the write-up" : "Publish to their Archivio"}
      </Button>
    </form>
  );
}
