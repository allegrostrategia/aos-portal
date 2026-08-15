"use client";

import { useActionState } from "react";

import { saveSession, type SessionState } from "@/lib/admin/hot-seat-actions";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";

export function SessionForm({ defaultMonth }: { defaultMonth: string }) {
  const [state, formAction] = useActionState<SessionState, FormData>(
    saveSession,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field
        label="Month"
        name="session_month"
        type="month"
        defaultValue={defaultMonth}
        hint="One session per month, week one. Saving the same month again updates it."
      />
      <Field
        label="Date and time"
        name="scheduled_for"
        type="datetime-local"
        required={false}
        hint="Optional — members see “time to be confirmed” until this is set."
      />
      <Field
        label="Zoom link"
        name="zoom_url"
        type="url"
        required={false}
        placeholder="https://"
      />

      <FormMessage error={state?.error} notice={state?.notice} />

      <SubmitButton full={false}>Save session</SubmitButton>
    </form>
  );
}
