"use client";

import { useActionState } from "react";

import {
  addBuild,
  changeBuildRate,
  saveCoachNote,
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
    <form action={formAction} className="mt-3 flex flex-col gap-3 border-t border-ink/10 pt-3">
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

      <p className="text-caption text-ink/50">
        Weeks already earned never change. Retiring stops it earning from that
        date, it doesn&rsquo;t take anything back.
      </p>

      <FormMessage error={state?.error} notice={state?.notice} />
    </form>
  );
}

/**
 * Nina's comment on a build (L'Editoriale §6).
 *
 * The write-up form that used to be here published Nina's record into the
 * member's Archivio. That flow is gone: she leaves a short comment, and the
 * member writes the SOP for the build themselves, seeing her comment as they
 * do. This form is the comment.
 */
export function CoachNoteForm({
  packId,
  note,
  memberHasWritten,
}: {
  packId: string;
  note: string | null;
  memberHasWritten: boolean;
}) {
  const [state, formAction] = useActionState<HoursState, FormData>(
    saveCoachNote,
    null,
  );

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2 border-t border-ink/10 pt-3">
      <input type="hidden" name="handover_pack_id" value={packId} />
      <TextArea
        label="Your comment on this build"
        name="coach_note"
        rows={3}
        required={false}
        defaultValue={note ?? ""}
        hint={
          memberHasWritten
            ? "They've written their SOP for this one. Your comment still shows beside it."
            : "A line or two of guidance. They write the SOP themselves, with this beside the form."
        }
      />
      <FormMessage error={state?.error} notice={state?.notice} />
      <Button type="submit" size="sm" variant="secondary" className="self-start">
        Save comment
      </Button>
    </form>
  );
}
