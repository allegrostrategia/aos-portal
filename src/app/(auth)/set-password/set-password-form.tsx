"use client";

import { useActionState } from "react";

import { updatePassword, type AuthFormState } from "@/lib/auth/actions";
import { Field, FormMessage, SubmitButton } from "@/components/form";

export function SetPasswordForm() {
  const [state, formAction] = useActionState<AuthFormState, FormData>(
    updatePassword,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
      />
      <Field
        label="Confirm password"
        name="confirm_password"
        type="password"
        autoComplete="new-password"
      />

      <FormMessage error={state?.error} notice={state?.notice} />

      <SubmitButton>Save and continue</SubmitButton>
    </form>
  );
}
