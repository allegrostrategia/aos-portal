"use client";

import { useActionState } from "react";

import { signIn, type AuthFormState } from "@/lib/auth/actions";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";

export function LoginForm({
  next,
  initialError,
}: {
  next: string;
  initialError?: string;
}) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(
    signIn,
    initialError ? { error: initialError } : null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      <Field label="Email" name="email" type="email" autoComplete="email" />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
      />

      <FormMessage error={state?.error} notice={state?.notice} />

      <SubmitButton>Sign in</SubmitButton>
    </form>
  );
}
