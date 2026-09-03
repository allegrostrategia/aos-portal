"use client";

import { useActionState } from "react";

import { runMatching, type MatchState } from "@/lib/admin/pairing-actions";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";

export function MatchForm({ defaultMonth }: { defaultMonth: string }) {
  const [state, formAction] = useActionState<MatchState, FormData>(
    runMatching,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field
        label="Month"
        name="pairing_month"
        type="month"
        defaultValue={defaultMonth}
        hint="Runs once. A month that's already matched won't be re-run."
      />
      <FormMessage error={state?.error} notice={state?.notice} />
      <SubmitButton full={false}>Match everyone up</SubmitButton>
    </form>
  );
}
