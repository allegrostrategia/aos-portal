"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { saveReflection, type ReflectionState } from "@/lib/reporting/reflection-actions";
import type { ReportNote } from "@/lib/reporting/queries";

/**
 * §8's member reflection: what they make of their own month.
 *
 * Where a retainer client reads a note from Nina, a member writes one to
 * themselves. It is the only thing on a self-serve report that is not a
 * number, and it is the reason the month is worth looking back at.
 *
 * Read-only is not a state this has: a member's months are never locked
 * (`report_month_is_locked` is retainer-only), because they are their
 * own editor and a lock would be a trap.
 */
export function Reflection({
  note,
  workspaceId,
  month,
  monthLabel,
}: {
  note: ReportNote | null;
  workspaceId: string;
  month: string;
  monthLabel: string;
}) {
  const [state, action] = useActionState<ReflectionState, FormData>(saveReflection, null);

  return (
    <Card>
      <SectionTitle>Your reflection</SectionTitle>
      <p className="mt-2 text-body text-ink/70">
        What {monthLabel} was actually like, in your words — the part the
        figures do not say.
      </p>

      <form action={action} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="workspace_id" value={workspaceId} />
        <input type="hidden" name="month" value={month} />
        <label className="flex flex-col gap-1.5">
          <span className="sr-only">Your reflection on {monthLabel}</span>
          <textarea
            name="body"
            rows={5}
            defaultValue={note?.body ?? ""}
            placeholder="What went well, what did not, and what you want to be different."
            className="w-full rounded-xl border border-ink/12 bg-card px-3.5 py-2.5 text-body text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/30"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <SaveButton />
          <p
            aria-live="polite"
            className={`text-small ${state?.error ? "text-deep-red" : "text-ink/60"}`}
          >
            {state?.error ?? state?.notice ?? ""}
          </p>
        </div>
      </form>
    </Card>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}
