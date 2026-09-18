"use client";

import { useActionState, useState } from "react";

import {
  publishRoadmap,
  saveMonthNote,
  setMonthTitle,
  setStartsOn,
  type StradaState,
} from "@/lib/roadmap/strada-actions";
import { FormMessage } from "@/components/ui/form";

const FIELD = "rounded-md border border-ink/15 bg-white px-3 py-1.5 text-small text-ink placeholder:text-ink/40";

/** The month's theme, editable in place (edit mode). */
export function MonthTitle({
  roadmapId,
  month,
  title,
  editable,
}: {
  roadmapId: string;
  month: number;
  title: string;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState<StradaState, FormData>(
    async (prev, formData) => {
      const result = await setMonthTitle(prev, formData);
      if (!result?.error) setEditing(false);
      return result;
    },
    null,
  );

  if (editing) {
    return (
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="roadmap_id" value={roadmapId} />
        <input type="hidden" name="month" value={month} />
        <input name="title" defaultValue={title} placeholder="Theme, e.g. Foundations" autoFocus className={FIELD} />
        <button type="submit" className="rounded-full bg-orange px-3 py-1 text-caption font-semibold text-ink">Save</button>
        <button type="button" onClick={() => setEditing(false)} className="text-caption text-ink/60 underline">Cancel</button>
        <FormMessage error={state?.error} />
      </form>
    );
  }

  return (
    <span className="flex items-baseline gap-2">
      <span className="text-eyebrow font-semibold tracking-wide text-ink/45 uppercase">
        {title || (editable ? "No theme yet" : "")}
      </span>
      {editable ? (
        <button type="button" onClick={() => setEditing(true)} aria-label={`Edit month ${month}'s theme`} className="text-caption text-ink/50 hover:text-ink">
          ✎
        </button>
      ) : null}
    </span>
  );
}

/** Week 1's month (edit mode). */
export function StartsOnForm({ roadmapId, startsOn }: { roadmapId: string; startsOn: string }) {
  const [state, formAction] = useActionState<StradaState, FormData>(setStartsOn, null);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2 text-caption text-white/80">
      <input type="hidden" name="roadmap_id" value={roadmapId} />
      <label htmlFor="starts_on">Week 1 begins</label>
      <input id="starts_on" type="date" name="starts_on" defaultValue={startsOn} className="rounded-md border border-white/30 bg-white/10 px-2 py-1 text-caption text-white" />
      <button type="submit" className="rounded-full border border-white/40 px-2.5 py-1 text-caption font-medium text-white hover:bg-white/10">Set</button>
      <FormMessage error={state?.error} notice={state?.notice} />
    </form>
  );
}

/** Publish a draft (edit mode). */
export function PublishForm({ roadmapId, memberName }: { roadmapId: string; memberName: string }) {
  const [state, formAction] = useActionState<StradaState, FormData>(publishRoadmap, null);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="roadmap_id" value={roadmapId} />
      <button type="submit" className="rounded-full bg-orange px-4 py-1.5 text-small font-semibold text-ink">
        Publish to {memberName}
      </button>
      <FormMessage error={state?.error} notice={state?.notice} />
    </form>
  );
}

/** "Off the itinerary": the member's own note for a month. */
export function ItineraryNote({
  roadmapId,
  month,
  body,
  editable,
}: {
  roadmapId: string;
  month: number;
  body: string;
  editable: boolean;
}) {
  const [state, formAction] = useActionState<StradaState, FormData>(saveMonthNote, null);
  return (
    <form action={formAction} className="my-2 rounded-xl border border-dashed border-ink/25 bg-card px-4 py-4">
      <input type="hidden" name="roadmap_id" value={roadmapId} />
      <input type="hidden" name="month" value={month} />
      <p className="font-display text-body font-medium text-ink italic">Off the itinerary</p>
      <label htmlFor={`note-${month}`} className="mb-2 block text-caption text-ink/55">
        Anything you did this month that wasn&rsquo;t on the plan
      </label>
      {editable ? (
        <>
          <textarea
            id={`note-${month}`}
            name="body"
            defaultValue={body}
            rows={2}
            placeholder="e.g. Landed a referral client, sorted my Instagram bio, finally cancelled that tool I never used…"
            className="w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-small text-ink placeholder:text-ink/35"
          />
          <div className="mt-2 flex items-center gap-3">
            <button type="submit" className="rounded-full border border-ink/20 px-3 py-1 text-caption font-medium text-ink hover:bg-cream-deep">
              Save
            </button>
            <FormMessage error={state?.error} notice={state?.notice} />
          </div>
        </>
      ) : (
        <p className="text-small whitespace-pre-wrap text-ink/80">{body || <span className="text-ink/40 italic">Nothing noted.</span>}</p>
      )}
    </form>
  );
}
