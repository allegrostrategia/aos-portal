"use client";

import { useActionState } from "react";

import { inviteMember, type InviteState } from "@/lib/admin/members";
import { Field, FormMessage, SubmitButton } from "@/components/form";

export function InviteForm({ today }: { today: string }) {
  const [state, formAction] = useActionState<InviteState, FormData>(
    inviteMember,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Full name" name="full_name" autoComplete="off" />
      <Field label="Email" name="email" type="email" autoComplete="off" />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Join date"
          name="join_date"
          type="date"
          defaultValue={today}
          hint="When their access and onboarding start."
        />
        <Field
          label="Contract term (months)"
          name="contract_term_months"
          type="number"
          defaultValue="6"
          hint="6 months, then rolling monthly."
        />
      </div>

      {/* The checklist Nina actually works to. Both are required by the database
          as well — this is the readable version of that rule. */}
      <fieldset className="rounded-md border border-navy/15 bg-white/50 p-4">
        <legend className="px-1 text-sm font-medium text-navy">
          Before creating the record
        </legend>
        <label className="flex items-start gap-2.5 py-1 text-sm text-navy">
          <input
            type="checkbox"
            name="payment_confirmed"
            className="mt-0.5 size-4 accent-navy"
          />
          Payment confirmed
        </label>
        <label className="flex items-start gap-2.5 py-1 text-sm text-navy">
          <input
            type="checkbox"
            name="contract_signed"
            className="mt-0.5 size-4 accent-navy"
          />
          Contract signed
        </label>
      </fieldset>

      <FormMessage error={state?.error} notice={state?.notice} />

      <SubmitButton>Send invitation</SubmitButton>
    </form>
  );
}
