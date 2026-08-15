"use client";

import { useActionState } from "react";

import { confirmChallenge, type SessionState } from "@/lib/admin/hot-seat-actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";

export function ConfirmForm({
  submissionId,
  memberName,
  suggested,
  initial,
  isConfirmed,
}: {
  submissionId: string;
  memberName: string;
  suggested: string;
  initial: string;
  isConfirmed: boolean;
}) {
  const [state, formAction] = useActionState<SessionState, FormData>(
    confirmChallenge,
    null,
  );

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-2">
      <input type="hidden" name="submission_id" value={submissionId} />
      <input type="hidden" name="suggested_challenge" value={suggested} />

      <label
        htmlFor={`confirmed-${submissionId}`}
        className="text-small font-medium text-navy"
      >
        {isConfirmed ? "Locked challenge" : `What ${memberName} builds`}
      </label>
      <textarea
        id={`confirmed-${submissionId}`}
        name="confirmed_challenge"
        rows={2}
        defaultValue={initial}
        placeholder="One specific, buildable thing"
        className="w-full rounded-md border border-navy/15 bg-white px-3 py-2 text-small text-navy placeholder:text-navy/40"
      />

      <FormMessage error={state?.error} notice={state?.notice} />

      <Button type="submit" size="sm" variant={isConfirmed ? "secondary" : "primary"} className="self-start">
        {isConfirmed ? "Update" : "Lock it in"}
      </Button>
    </form>
  );
}
