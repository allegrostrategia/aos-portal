"use client";

import { useActionState } from "react";

import { createDraw, runDrawStep, type DrawState } from "@/lib/admin/draw-actions";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

export function NewDrawForm({ defaultMonth }: { defaultMonth: string }) {
  const [state, formAction] = useActionState<DrawState, FormData>(
    createDraw,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Month it's for" name="draw_month" type="month" defaultValue={defaultMonth} />
      <Field
        label="Prize"
        name="prize"
        hint="Members see this on the draw card, so write it the way you'd say it."
      />
      <Field label="Drawn on" name="draw_date" type="date" />
      <FormMessage error={state?.error} notice={state?.notice} />
      <SubmitButton full={false}>Set up the draw</SubmitButton>
    </form>
  );
}

/**
 * The two moves on an open draw.
 *
 * Both buttons post to one action so a single message area can report whichever
 * was pressed. `entrants` decides which is offered: drawing before the list is
 * locked isn't a thing you can half-do, so it isn't shown as an option.
 */
export function DrawControls({
  drawId,
  entrants,
  eligible,
}: {
  drawId: string;
  entrants: number;
  eligible: number;
}) {
  const [state, formAction] = useActionState<DrawState, FormData>(
    runDrawStep,
    null,
  );

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-3">
      <input type="hidden" name="draw_id" value={drawId} />

      {/* Three states, not two. "No entrants" and "nobody has qualified" look
          identical in the data and mean opposite things to whoever is running
          the draw — one is a step not taken yet, the other is a month that
          hasn't earned anyone a ticket. Collapsing them produced a button that
          told Nina to do the thing she had just done. */}
      <div className="flex flex-wrap items-center gap-3">
        {entrants > 0 ? (
          <>
            <Button type="submit" name="intent" value="draw" size="sm">
              Draw the winner
            </Button>
            <Button
              type="submit"
              name="intent"
              value="open"
              variant="secondary"
              size="sm"
            >
              Re-check for new entrants
            </Button>
          </>
        ) : eligible > 0 ? (
          <Button type="submit" name="intent" value="open" variant="secondary" size="sm">
            Lock in {eligible} {eligible === 1 ? "entrant" : "entrants"}
          </Button>
        ) : (
          <span className="text-caption text-navy/50">
            Nobody has completed the whole month, so there&rsquo;s nobody to
            enter. Nothing to do here until someone does.
          </span>
        )}
      </div>

      <FormMessage error={state?.error} notice={state?.notice} />
    </form>
  );
}
