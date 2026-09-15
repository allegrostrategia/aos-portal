"use client";

import { useActionState } from "react";

import { saveSubmission, type HotSeatState } from "@/lib/hot-seat/actions";
import type { HotSeatSubmission } from "@/lib/hot-seat/queries";
import { Checkbox, FormMessage, SubmitButton, TextArea } from "@/components/ui/form";
import { Card, Eyebrow } from "@/components/ui/card";

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
          hint="In your own words. Nina will have your tracked time in front of her already. This is the part only you can say."
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
          hint="The most useful box here. The live time builds one specific thing. Naming it is what makes that possible."
        />
      </Card>

      {/* Round 3, §B: the reflection. Additive; the three above are as they
          were. The month's log is shown above this form by the page, so
          "look back at your log" has something to look at. */}
      <Card className="bg-lemon/25">
        <Eyebrow tone="accent">Looking back at your month</Eyebrow>
        <p className="mt-1 mb-3 text-small text-ink/75">
          Your log for the month is just above. What has actually been eating
          your time? And what would you like to make quicker, simpler or
          automatic? It does not have to be the thing you are stuck on.
        </p>
        <TextArea
          label="What your month says, and what you'd streamline"
          name="reflection"
          rows={4}
          required={false}
          defaultValue={submission?.reflection ?? ""}
        />
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
