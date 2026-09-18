"use client";

import { useActionState } from "react";

import { saveSubmission, type HotSeatState } from "@/lib/hot-seat/actions";
import type { HotSeatSubmission } from "@/lib/hot-seat/queries";
import { Checkbox, FormMessage, SubmitButton, TextArea } from "@/components/ui/form";
import { Card, Eyebrow } from "@/components/ui/card";

/**
 * The four questions (round 4, item 12; confirmed wording). The first three
 * in cream cards; the fourth, what they'd like to hot seat, in the yellow
 * box with the "not sure yet" tick beside it.
 */
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
          label="What is making you feel stuck at the moment?"
          name="challenge"
          rows={3}
          defaultValue={submission?.challenge ?? ""}
          hint="In your own words. Nina will have your tracked time in front of her already. This is the part only you can say."
        />
      </Card>

      <Card>
        <TextArea
          label="What is taking up a lot of your time at the moment?"
          name="time_sink"
          rows={3}
          required={false}
          defaultValue={submission?.time_sink ?? ""}
          hint="Your month's log is just above, if it helps."
        />
      </Card>

      <Card>
        <TextArea
          label="What are you doing right now that you don't think you should be doing, or that someone else could do instead, that you don't enjoy?"
          name="should_stop"
          rows={3}
          required={false}
          defaultValue={submission?.should_stop ?? ""}
        />
      </Card>

      <Card className="bg-lemon/25">
        <Eyebrow tone="accent">What you&rsquo;d like to hot seat</Eyebrow>
        <div className="mt-2">
          <TextArea
            label="Based on this, what would you like your hot seat to focus on?"
            name="reflection"
            rows={4}
            required={false}
            defaultValue={submission?.reflection ?? ""}
            hint="If you're not sure, just say so. Nina will help you decide."
          />
        </div>
        <div className="mt-2">
          <Checkbox
            label="Not sure yet. Honest answer; Nina will look at the log with you."
            name="reflection_unsure"
            defaultChecked={submission?.reflection_unsure ?? false}
          />
        </div>
      </Card>

      <FormMessage error={state?.error} notice={state?.notice} />

      <div>
        <SubmitButton full={false}>
          {submission?.submitted_at ? "Update my submission" : "Submit"}
        </SubmitButton>
        <p className="mt-2 text-small text-ink/60">
          Editable until Nina preps the session.
        </p>
      </div>
    </form>
  );
}
