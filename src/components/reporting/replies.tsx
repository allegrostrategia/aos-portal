"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { addClientReply, editClientReply } from "@/lib/reporting/reply-actions";
import type { NoteState } from "@/lib/reporting/note-actions";
import type { ReportNote } from "@/lib/reporting/queries";

/**
 * §8's client reply — a dated thread under the report, oldest first.
 *
 * Nina's decision of 5 October: a client may reply more than once, so a
 * report can become a short conversation rather than one box they get a
 * single go at. They may reword their own replies and never delete one;
 * both are the database's rules, not this component's.
 *
 * The same thread is what the team sees, on the same screen, so Nina reads a
 * reply where she wrote the note it answers. She has no box of her own here:
 * her half of the conversation is the strategist's note above it.
 */
export function ClientReplies({
  replies,
  canReply,
  currentUserId,
  workspaceId,
  month,
  monthLabel,
}: {
  replies: ReportNote[];
  /** The client, on a published month. Never the team. */
  canReply: boolean;
  currentUserId: string;
  workspaceId: string;
  month: string;
  monthLabel: string;
}) {
  // Nothing to show and nothing to say: no empty card on the team's screen
  // for a month the client has not written on.
  if (replies.length === 0 && !canReply) return null;

  return (
    <Card>
      <SectionTitle>{canReply ? "Anything you'd like to say?" : "From the client"}</SectionTitle>

      {replies.length === 0 ? (
        <p className="text-body text-ink/70">
          {canReply
            ? `Questions, corrections, or anything ${monthLabel} brought up. Your strategist reads this with the report.`
            : null}
        </p>
      ) : (
        <ol className="flex flex-col gap-5">
          {replies.map((reply) => (
            <Reply
              key={reply.id}
              reply={reply}
              mine={reply.author_id === currentUserId}
            />
          ))}
        </ol>
      )}

      {canReply ? (
        <NewReply workspaceId={workspaceId} month={month} any={replies.length > 0} />
      ) : null}
    </Card>
  );
}

/** "2 October 2026" — a thread needs dates or it stops being a thread. */
function replyDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function Reply({ reply, mine }: { reply: ReportNote; mine: boolean }) {
  const [editing, setEditing] = useState(false);

  return (
    <li className="border-l-2 border-ink/10 pl-4">
      <p className="text-caption text-ink/55">
        <span className="font-display text-body text-ink">{reply.author_name}</span>
        <span className="ml-2 font-mono">{replyDate(reply.created_at)}</span>
      </p>

      {editing ? (
        <EditReply reply={reply} onDone={() => setEditing(false)} />
      ) : (
        <>
          {reply.body.split(/\n{2,}/).map((paragraph, index) => (
            <p key={index} className="mt-2 text-body text-ink/80">
              {paragraph}
            </p>
          ))}
          {mine ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-2 text-small text-ink/55 underline underline-offset-4 transition hover:text-ink"
            >
              Reword this
            </button>
          ) : null}
        </>
      )}
    </li>
  );
}

function EditReply({ reply, onDone }: { reply: ReportNote; onDone: () => void }) {
  const [state, action] = useActionState<NoteState, FormData>(editClientReply, null);

  return (
    <form action={action} className="mt-2 flex flex-col gap-2">
      <input type="hidden" name="note_id" value={reply.id} />
      <label htmlFor={`reply-${reply.id}`} className="sr-only">
        Reword your reply
      </label>
      <textarea
        id={`reply-${reply.id}`}
        name="body"
        rows={4}
        defaultValue={reply.body}
        className="w-full rounded-xl border border-ink/12 bg-cream-deep px-3.5 py-2.5 text-body text-ink outline-none transition focus:border-orange focus:bg-card focus:ring-2 focus:ring-orange/30"
      />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitLabel idle="Save" busy="Saving…" />
        <button
          type="button"
          onClick={onDone}
          className="text-small text-ink/55 underline underline-offset-4 transition hover:text-ink"
        >
          Cancel
        </button>
        <p
          aria-live="polite"
          className={`text-small ${state?.error ? "text-deep-red" : "text-ink/60"}`}
        >
          {state?.error ?? state?.notice ?? ""}
        </p>
      </div>
    </form>
  );
}

function NewReply({
  workspaceId,
  month,
  any,
}: {
  workspaceId: string;
  month: string;
  any: boolean;
}) {
  const [state, action] = useActionState<NoteState, FormData>(addClientReply, null);

  return (
    <form action={action} className="mt-5 flex flex-col gap-3">
      <input type="hidden" name="workspace_id" value={workspaceId} />
      <input type="hidden" name="month" value={month} />

      <label htmlFor="new-reply" className="sr-only">
        Your reply
      </label>
      <textarea
        id="new-reply"
        name="body"
        rows={4}
        // Deliberately not reset on success: a server action re-renders the
        // page and an uncontrolled textarea would keep the sent text sitting
        // there looking unsent. The key changes with the reply count.
        key={`reply-${any}`}
        placeholder={any ? "Add to the conversation…" : "Anything you'd like to raise."}
        className="w-full rounded-xl border border-ink/12 bg-cream-deep px-3.5 py-2.5 text-body text-ink outline-none transition placeholder:text-ink/40 focus:border-orange focus:bg-card focus:ring-2 focus:ring-orange/30"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          aria-live="polite"
          className={`text-small ${state?.error ? "text-deep-red" : "text-ink/60"}`}
        >
          {state?.error ?? state?.notice ?? ""}
        </p>
        <SubmitLabel idle={any ? "Send" : "Send to your strategist"} busy="Sending…" />
      </div>
    </form>
  );
}

function SubmitLabel({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending ? busy : idle}
    </Button>
  );
}
