"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { unpublishMonth } from "@/lib/reporting/note-actions";
import type { NoteState } from "@/lib/reporting/note-actions";

/**
 * What a published month says instead of letting you type into it.
 *
 * Dom's decision, 7 October 2026, after the finding that nothing held a
 * published month still. The lock itself is a database guard; this is the
 * route through it, and the route is the part that makes it a feature
 * rather than an obstruction: **unpublish → fix → republish**, with the
 * client emailed to say the report changed.
 *
 * Two audiences, two honest endings. Nina can unpublish, so she gets the
 * button — hunting for it on another screen is how a lock turns into a
 * reason to edit the database by hand. Elize cannot, so she is told whose
 * it is rather than given a button that would refuse her.
 */
export function PublishedLock({
  workspaceId,
  month,
  monthLabel,
  canUnpublish,
  warning,
}: {
  workspaceId: string;
  month: string;
  monthLabel: string;
  /** Publishing, and taking it back, is Nina's alone (30 Sep 2026). */
  canUnpublish: boolean;
  /** What unpublishing would do to the months after this one, or null. */
  warning: string | null;
}) {
  const [state, action] = useActionState<NoteState, FormData>(unpublishMonth, null);

  // A standard cream card, not tone="orange": the brand keeps orange for
  // the timer, and a month having gone out is a routine state rather than
  // an alarm. The PUBLISHED pill in the header already carries the status;
  // what this card adds is the way through.
  return (
    <Card className="mb-6">
      <SectionTitle>{monthLabel} has gone out</SectionTitle>
      <p className="text-body text-ink/80">
        The client has this report, so it is read-only. To correct something,
        take it back to draft, make the change, and publish again — they are
        emailed to say it has been updated.
      </p>

      {warning ? (
        // Before the click, not after it: this is the thing she needs in
        // order to decide, and the card unmounts the moment the month is
        // a draft again.
        <p className="mt-4 rounded-xl bg-cream-deep px-4 py-3 text-small text-ink/80">
          {warning}
        </p>
      ) : null}

      {canUnpublish ? (
        <form action={action} className="mt-4 flex flex-wrap items-center gap-3">
          <input type="hidden" name="workspace_id" value={workspaceId} />
          <input type="hidden" name="month" value={month} />
          <UnpublishButton />
          <p
            aria-live="polite"
            className={`text-small ${state?.error ? "text-deep-red" : "text-ink/70"}`}
          >
            {state?.error ?? state?.notice ?? ""}
          </p>
        </form>
      ) : (
        <p className="mt-3 text-small text-ink/70">
          Nina can take it back to draft for you.
        </p>
      )}
    </Card>
  );
}

function UnpublishButton() {
  const { pending } = useFormStatus();
  // The primary pill, because it is the only action on the screen.
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Taking it back…" : "Unpublish to make changes"}
    </Button>
  );
}
