"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import {
  publishMonth,
  saveStrategistNote,
  unpublishMonth,
  type NoteState,
} from "@/lib/reporting/note-actions";
import type { ReportNote } from "@/lib/reporting/queries";

/**
 * "Notes from your strategist" (§8), and the box Elize and Nina write it in.
 *
 * The same component does both, because who is looking decides which half
 * appears and building two would mean two chances to show a client an editor.
 * When `canWrite` is false the textarea is not rendered at all — §13: removed
 * from the page, never hidden with CSS.
 */
export function StrategistNotes({
  notes,
  canWrite,
  workspaceId,
  month,
  category,
  mine,
  emptyMessage,
}: {
  notes: ReportNote[];
  canWrite: boolean;
  workspaceId: string;
  month: string;
  /** Empty string for the Overview note. */
  category: string;
  /** The current person's own note, which is the one they can revise. */
  mine: ReportNote | null;
  emptyMessage: string;
}) {
  const others = notes.filter((n) => n.id !== mine?.id);

  return (
    <Card>
      <SectionTitle>Notes from your strategist</SectionTitle>

      {notes.length === 0 && !canWrite ? (
        <p className="text-body text-ink/60">{emptyMessage}</p>
      ) : null}

      <div className="flex flex-col gap-6">
        {others.map((note) => (
          <WrittenNote key={note.id} note={note} />
        ))}

        {canWrite ? (
          <NoteEditor
            workspaceId={workspaceId}
            month={month}
            category={category}
            existing={mine}
          />
        ) : mine ? (
          <WrittenNote note={mine} />
        ) : null}
      </div>
    </Card>
  );
}

function WrittenNote({ note }: { note: ReportNote }) {
  return (
    <div>
      {/* Paragraphs kept as the author typed them. A note is prose, and
          collapsing it to one block changes how it reads. */}
      {note.body.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index} className="mt-3 text-body text-ink/80 first:mt-0">
          {paragraph}
        </p>
      ))}
      <p className="mt-4 text-caption text-ink/55">
        <span className="font-display text-body text-ink">{note.author_name}</span>
        <span className="ml-2">Your strategist</span>
      </p>
    </div>
  );
}

function NoteEditor({
  workspaceId,
  month,
  category,
  existing,
}: {
  workspaceId: string;
  month: string;
  category: string;
  existing: ReportNote | null;
}) {
  const [state, action] = useActionState<NoteState, FormData>(saveStrategistNote, null);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="workspace_id" value={workspaceId} />
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="category" value={category} />

      <label htmlFor="note-body" className="sr-only">
        Your note for this month
      </label>
      <textarea
        id="note-body"
        name="body"
        rows={7}
        defaultValue={existing?.body ?? ""}
        placeholder="What happened this month, and what you recommend next."
        className="w-full rounded-xl border border-ink/12 bg-cream-deep px-3.5 py-2.5 text-body text-ink outline-none transition placeholder:text-ink/40 focus:border-orange focus:bg-card focus:ring-2 focus:ring-orange/30"
      />
      <NoteFooter state={state} existing={Boolean(existing)} />
    </form>
  );
}

function NoteFooter({ state, existing }: { state: NoteState; existing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p
        aria-live="polite"
        className={`text-small ${state?.error ? "text-deep-red" : "text-ink/60"}`}
      >
        {pending
          ? "Saving…"
          : (state?.error ??
            state?.notice ??
            (existing ? "Saved earlier. Edit and save again to change it." : ""))}
      </p>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {existing ? "Save changes" : "Save note"}
      </Button>
    </div>
  );
}

/**
 * The publish control. Nina only — §2's role table, and her decision of 30
 * September that Elize drafts and she publishes.
 *
 * Rendered for nobody else, so a team member never sees a button they cannot
 * press. The database refuses it independently if they find one anyway.
 */
export function PublishControl({
  workspaceId,
  month,
  monthLabel,
  publishedAt,
}: {
  workspaceId: string;
  month: string;
  monthLabel: string;
  publishedAt: string | null;
}) {
  const [state, action] = useActionState<NoteState, FormData>(
    publishedAt ? unpublishMonth : publishMonth,
    null,
  );

  return (
    <Card>
      <SectionTitle>{publishedAt ? "Published" : "Ready to publish?"}</SectionTitle>
      <p className="text-body text-ink/70">
        {publishedAt
          ? `${monthLabel} is visible to the client. Take it back to draft if something needs fixing.`
          : `${monthLabel} is a draft. Nothing in it is visible to the client until you publish.`}
      </p>

      <form action={action} className="mt-4 flex flex-wrap items-center gap-3">
        <input type="hidden" name="workspace_id" value={workspaceId} />
        <input type="hidden" name="month" value={month} />
        <PublishButton published={Boolean(publishedAt)} />
        <p
          aria-live="polite"
          className={`text-small ${state?.error ? "text-deep-red" : "text-ink/60"}`}
        >
          {state?.error ?? state?.notice ?? ""}
        </p>
      </form>

      {!publishedAt ? (
        <p className="mt-3 text-caption text-ink/50">
          Publishing does not email the client yet — tell them yourself for now.
        </p>
      ) : null}
    </Card>
  );
}

function PublishButton({ published }: { published: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={published ? "secondary" : "primary"}
      disabled={pending}
    >
      {pending
        ? published
          ? "Taking it back…"
          : "Publishing…"
        : published
          ? "Back to draft"
          : "Publish this month"}
    </Button>
  );
}
