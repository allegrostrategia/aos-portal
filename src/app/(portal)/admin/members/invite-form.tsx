"use client";

import { useActionState } from "react";

import { inviteMember, type InviteState } from "@/lib/admin/members";
import {
  Checkbox,
  Field,
  FormMessage,
  SubmitButton,
} from "@/components/ui/form";

export function InviteForm({ today }: { today: string }) {
  const [state, formAction] = useActionState<InviteState, FormData>(
    inviteMember,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Full name" name="full_name" autoComplete="off" required />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="off"
        required
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Join date"
          name="join_date"
          type="date"
          defaultValue={today}
          hint="When their access and onboarding start."
        />
        <Field
          label="Contract term"
          name="contract_term_months"
          type="number"
          defaultValue="6"
          hint="Months, then rolling."
        />
      </div>

      {/* The checklist Nina actually works to. Both are required by the database
          as well — this is the readable version of that rule. */}
      <fieldset className="rounded-md border border-navy/15 bg-white/50 p-4">
        <legend className="px-1 text-small font-medium text-navy">
          Before creating the record
        </legend>
        <Checkbox label="Payment confirmed" name="payment_confirmed" />
        <Checkbox label="Contract signed" name="contract_signed" />
      </fieldset>

      <FormMessage error={state?.error} notice={state?.notice} />

      <SubmitButton>Send invitation</SubmitButton>
    </form>
  );
}
