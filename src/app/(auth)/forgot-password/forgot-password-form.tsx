"use client";

import { useActionState } from "react";

import { requestPasswordReset, type AuthFormState } from "@/lib/auth/actions";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<AuthFormState, FormData>(
    requestPasswordReset,
    null,
  );

  // Once the request is in, the form is gone — leaving it up invites people to
  // submit three times and wonder which email is the live one.
  if (state?.notice) {
    return <FormMessage notice={state.notice} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Email" name="email" type="email" autoComplete="email" />

      <FormMessage error={state?.error} />

      <SubmitButton>Send reset link</SubmitButton>
    </form>
  );
}
