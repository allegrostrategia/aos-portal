"use client";

import { useActionState } from "react";

import { saveSubmission, type HotSeatState } from "@/lib/hot-seat/actions";
import type { HotSeatSubmission } from "@/lib/hot-seat/queries";
import { FormMessage, SubmitButton, TextArea } from "@/components/ui/form";
import { Card } from "@/components/ui/card";

export function SubmissionForm({
  sessionId,
  submission,
}: {
  sessionId: string;
  submission: HotSeatSubmission | null;
}) {
  const [state, formAction] = useActionState<HotSeatState, FormData>(
    saveSubmission,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="session_id" value={sessionId} />

      <Card>
        <TextArea
          label="What are you stuck on?"
          name="challenge"
          rows={3}
          defaultValue={submission?.challenge ?? ""}
          hint="In your own words. Nina will have your tracked time in front of her already — this is the part only you can say."
        />
      </Card>

      <Card>
        <TextArea
          label="What have you already tried?"
          name="already_tried"
          rows={3}
          required={false}
          defaultValue={submission?.already_tried ?? ""}
          hint="Saves the session going somewhere you've already been."
        />
      </Card>

      <Card>
        <TextArea
          label="What would ‘done’ look like for this session?"
          name="done_looks_like"
          rows={3}
          required={false}
          defaultValue={submission?.done_looks_like ?? ""}
          hint="The most useful box here. Five minutes builds one specific thing — naming it is what makes that possible."
        />
      </Card>

      <FormMessage error={state?.error} notice={state?.notice} />

      <div>
        <SubmitButton full={false}>
          {submission?.submitted_at ? "Update my submission" : "Submit"}
        </SubmitButton>
        <p className="mt-2 text-small text-navy/60">
          Editable until Nina preps the session.
        </p>
      </div>
    </form>
  );
}
