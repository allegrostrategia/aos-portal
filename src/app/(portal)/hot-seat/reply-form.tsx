"use client";

import { useActionState, useRef } from "react";

import { replyOnSubmission, type HotSeatState } from "@/lib/hot-seat/actions";
import { FormMessage, SubmitButton, TextArea } from "@/components/ui/form";

/** The member's side of the thread (round 3, §B). */
export function ReplyForm({ submissionId }: { submissionId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<HotSeatState, FormData>(
    async (prev, formData) => {
      const result = await replyOnSubmission(prev, formData);
      if (!result?.error) formRef.current?.reset();
      return result;
    },
    null,
  );

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3 border-t border-ink/10 pt-4">
      <input type="hidden" name="submission_id" value={submissionId} />
      <TextArea
        label="Reply to Nina"
        name="body"
        rows={3}
        hint="She reads this before the call, with your log beside it."
      />
      <FormMessage error={state?.error} />
      <div>
        <SubmitButton full={false}>Send reply</SubmitButton>
      </div>
    </form>
  );
}
