"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, NumberedRow, SectionTitle } from "@/components/ui/card";
import { saveObjectives } from "@/lib/reporting/objective-actions";
import type { NoteState } from "@/lib/reporting/note-actions";
import type { ReportNote } from "@/lib/reporting/queries";

/**
 * "What we're focusing on next month" — §8's up to three objectives.
 *
 * One component for both sides, as with the strategist's note: who is looking
 * decides which half renders, and building two would be two chances to show a
 * client an editor. When `canWrite` is false there are no textareas in the
 * page at all — §13 asks for removed, not hidden.
 *
 * Nothing renders for a client when none are set. An empty heading promising
 * a focus that isn't there reads worse than silence.
 */
export function Objectives({
  objectives,
  canWrite,
  workspaceId,
  month,
}: {
  objectives: ReportNote[];
  canWrite: boolean;
  workspaceId: string;
  month: string;
}) {
  const written = objectives
    .filter((note) => note.body.trim() !== "")
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  if (!canWrite) {
    if (written.length === 0) return null;
    return (
      <Card>
        <SectionTitle>What we&rsquo;re focusing on next month</SectionTitle>
        <ol className="mt-1">
          {written.map((note, index) => (
            <NumberedRow key={note.id} index={index + 1} title={note.body} />
          ))}
        </ol>
      </Card>
    );
  }

  return <ObjectiveEditor objectives={objectives} workspaceId={workspaceId} month={month} />;
}

function ObjectiveEditor({
  objectives,
  workspaceId,
  month,
}: {
  objectives: ReportNote[];
  workspaceId: string;
  month: string;
}) {
  const [state, action] = useActionState<NoteState, FormData>(saveObjectives, null);

  const bodyAt = (position: number) =>
    objectives.find((note) => note.position === position)?.body ?? "";

  return (
    <Card>
      <SectionTitle>What we&rsquo;re focusing on next month</SectionTitle>
      <p className="text-body text-ink/70">
        Up to three. The client sees them once this month is published, and
        empty ones simply don&rsquo;t appear — you are never made to fill three.
      </p>

      <form action={action} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="workspace_id" value={workspaceId} />
        <input type="hidden" name="month" value={month} />

        {[1, 2, 3].map((position) => (
          <div key={position} className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-2.5 font-mono text-caption text-ink/45"
            >
              {position}
            </span>
            <label htmlFor={`objective-${position}`} className="sr-only">
              Objective {position}
            </label>
            <textarea
              id={`objective-${position}`}
              name={`objective_${position}`}
              rows={2}
              defaultValue={bodyAt(position)}
              placeholder={
                position === 1 ? "The one thing that moves the needle next month." : ""
              }
              className="w-full rounded-xl border border-ink/12 bg-cream-deep px-3.5 py-2.5 text-body text-ink outline-none transition placeholder:text-ink/40 focus:border-orange focus:bg-card focus:ring-2 focus:ring-orange/30"
            />
          </div>
        ))}

        <ObjectiveFooter state={state} />
      </form>
    </Card>
  );
}

function ObjectiveFooter({ state }: { state: NoteState }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p
        aria-live="polite"
        className={`text-small ${state?.error ? "text-deep-red" : "text-ink/60"}`}
      >
        {pending ? "Saving…" : (state?.error ?? state?.notice ?? "")}
      </p>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        Save focus
      </Button>
    </div>
  );
}
