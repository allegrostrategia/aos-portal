"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";

import { deleteAction, setActionDone, upsertAction, type StradaState } from "@/lib/roadmap/strada-actions";
import { ACTION_BUCKETS, type ActionBucket } from "@/lib/roadmap/shape";
import { BUCKET_PILL } from "@/lib/roadmap/buckets";
import type { TrainingOption } from "@/lib/roadmap/queries";
import { FormMessage } from "@/components/ui/form";

/**
 * One action on La Strada: pill, tick, text, link chip; in edit mode a
 * pencil that turns the row into its own small form. The tick is optimistic
 * and saves on its own.
 */
export type ActionView = {
  id: string;
  label: string;
  bucket: ActionBucket | null;
  week: number | null;
  trainingId: string | null;
  training: { title: string; stationName: string; stationSlug: string } | null;
  done: boolean;
};

const FIELD = "w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-small text-ink placeholder:text-ink/40";

export function ActionRow({
  roadmapId,
  month,
  action,
  editable,
  trainings,
}: {
  roadmapId: string;
  month: number;
  action: ActionView;
  editable: boolean;
  trainings: TrainingOption[];
}) {
  const [done, setDone] = useState(action.done);
  const [, start] = useTransition();
  const [editing, setEditing] = useState(false);

  function toggle() {
    const next = !done;
    setDone(next);
    start(async () => {
      const r = await setActionDone(roadmapId, action.id, next);
      if (!r.ok) setDone(!next);
    });
  }

  if (editing) {
    return (
      <li className="border-t border-ink/6 py-3 first:border-t-0 first:pt-0">
        <ActionEditor
          roadmapId={roadmapId}
          month={month}
          week={action.week}
          action={action}
          trainings={trainings}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  const pill = action.bucket ? BUCKET_PILL[action.bucket] : null;

  return (
    <li className="flex items-start gap-2.5 border-t border-ink/6 py-2.5 first:border-t-0 first:pt-0">
      {pill ? (
        <span
          className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[0.66rem] font-semibold whitespace-nowrap ${pill.text}`}
          style={{ backgroundColor: pill.colour }}
        >
          {pill.label}
        </span>
      ) : (
        <span className="mt-0.5 w-[3.4rem] shrink-0" aria-hidden />
      )}

      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        onClick={toggle}
        aria-label={done ? `Done: ${action.label}. Untick` : `Mark done: ${action.label}`}
        className={`mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] text-[0.68rem] font-bold text-white transition ${
          done ? "border-orange bg-orange" : "border-ink/30 bg-transparent hover:border-ink/60"
        }`}
      >
        {done ? "✓" : ""}
      </button>

      <div className="min-w-0 flex-1">
        <span className={`text-small text-ink ${done ? "line-through opacity-50" : ""}`}>{action.label}</span>
        {action.training ? (
          <Link
            href={`/stations/${action.training.stationSlug}`}
            className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-ink/12 bg-cream-deep px-2 py-0.5 text-caption text-ink hover:border-ink/30"
          >
            <span aria-hidden className="text-orange">▸</span>
            {action.training.stationName} · {action.training.title}
          </Link>
        ) : null}
      </div>

      {editable ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit: ${action.label}`}
          className="flex size-[26px] shrink-0 items-center justify-center rounded-[7px] border border-ink/15 bg-cream-deep text-caption text-ink hover:border-ink/40"
        >
          ✎
        </button>
      ) : null}
    </li>
  );
}

/** The form for one action: new, or existing in place. */
export function ActionEditor({
  roadmapId,
  month,
  week,
  action,
  trainings,
  onDone,
}: {
  roadmapId: string;
  month: number;
  week: number | null;
  action?: ActionView;
  trainings: TrainingOption[];
  onDone: () => void;
}) {
  const [state, formAction] = useActionState<StradaState, FormData>(
    async (prev, formData) => {
      const result = await upsertAction(prev, formData);
      if (!result?.error) onDone();
      return result;
    },
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-xl border border-orange/40 bg-lemon/20 p-3">
      <input type="hidden" name="roadmap_id" value={roadmapId} />
      <input type="hidden" name="month" value={month} />
      {action ? <input type="hidden" name="action_id" value={action.id} /> : null}
      <input
        name="label"
        defaultValue={action?.label ?? ""}
        placeholder="What they actually do"
        autoFocus
        className={FIELD}
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <select name="bucket" defaultValue={action?.bucket ?? ""} className={FIELD} aria-label="Bucket">
          <option value="">No bucket</option>
          {ACTION_BUCKETS.map((b) => (
            <option key={b} value={b}>{BUCKET_PILL[b].legend}</option>
          ))}
        </select>
        <select name="week" defaultValue={action?.week ?? week ?? ""} className={FIELD} aria-label="Week of the month">
          <option value="">No week set</option>
          {[1, 2, 3, 4, 5].map((w) => (
            <option key={w} value={w}>Week {w} of the month</option>
          ))}
        </select>
        <select name="training_id" defaultValue={action?.trainingId ?? ""} className={FIELD} aria-label="Training">
          <option value="">No training linked</option>
          {trainings.map((t) => (
            <option key={t.id} value={t.id}>{t.stationName} · {t.title}</option>
          ))}
        </select>
      </div>
      <FormMessage error={state?.error} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="rounded-full bg-orange px-3.5 py-1.5 text-small font-semibold text-ink">
          {action ? "Save" : "Add"}
        </button>
        <button type="button" onClick={onDone} className="text-small text-ink/60 underline underline-offset-4 hover:text-ink">
          Cancel
        </button>
        {action ? (
          <button
            type="submit"
            formAction={deleteAction}
            className="ml-auto text-small text-deep-red underline underline-offset-4"
            onClick={(e) => {
              if (!confirm("Remove this action? Their tick and note on it go too.")) e.preventDefault();
            }}
          >
            Remove
          </button>
        ) : null}
      </div>
    </form>
  );
}

/** "+ Add action" at the foot of a week, in edit mode. */
export function AddAction({
  roadmapId,
  month,
  week,
  trainings,
}: {
  roadmapId: string;
  month: number;
  week: number | null;
  trainings: TrainingOption[];
}) {
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <div className="mt-3">
        <ActionEditor roadmapId={roadmapId} month={month} week={week} trainings={trainings} onDone={() => setOpen(false)} />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="mt-3 flex items-center gap-1.5 text-small font-medium text-orange hover:underline"
    >
      + Add action
    </button>
  );
}
