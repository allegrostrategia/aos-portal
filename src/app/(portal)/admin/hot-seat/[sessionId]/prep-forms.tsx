"use client";

import { useActionState } from "react";

import {
  confirmChallenge,
  saveReplayNote,
  setAttendance,
  type SessionState,
} from "@/lib/admin/hot-seat-actions";
import { Button } from "@/components/ui/button";
import { FormMessage, TextArea } from "@/components/ui/form";

/**
 * Identifies the member either by an existing submission or by session + member.
 *
 * The second form is what lets Nina prep somebody who never submitted: there's
 * no row to point at yet, so the row gets created when she locks the challenge.
 */
function Identity({
  submissionId,
  sessionId,
  memberId,
}: {
  submissionId: string | null;
  sessionId: string;
  memberId: string;
}) {
  return submissionId ? (
    <input type="hidden" name="submission_id" value={submissionId} />
  ) : (
    <>
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="member_id" value={memberId} />
    </>
  );
}

export function ConfirmForm({
  submissionId,
  sessionId,
  memberId,
  memberName,
  suggested,
  initial,
  isConfirmed,
  fallbackHint,
}: {
  submissionId: string | null;
  sessionId: string;
  memberId: string;
  memberName: string;
  suggested: string;
  initial: string;
  isConfirmed: boolean;
  fallbackHint?: string;
}) {
  const [state, formAction] = useActionState<SessionState, FormData>(
    confirmChallenge,
    null,
  );

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-2">
      <Identity submissionId={submissionId} sessionId={sessionId} memberId={memberId} />
      <input type="hidden" name="suggested_challenge" value={suggested} />

      <label
        htmlFor={`confirmed-${memberId}`}
        className="text-small font-medium text-navy"
      >
        {isConfirmed ? "Locked challenge" : `What ${memberName} builds`}
      </label>
      <textarea
        id={`confirmed-${memberId}`}
        name="confirmed_challenge"
        rows={2}
        defaultValue={initial}
        placeholder={fallbackHint ?? "One specific, buildable thing"}
        className="w-full rounded-md border border-navy/15 bg-white px-3 py-2 text-small text-navy placeholder:text-navy/40"
      />
      {fallbackHint ? (
        <p className="text-caption text-navy/60">{fallbackHint}</p>
      ) : null}

      <FormMessage error={state?.error} notice={state?.notice} />

      <Button type="submit" size="sm" variant={isConfirmed ? "secondary" : "primary"} className="self-start">
        {isConfirmed ? "Update" : "Lock it in"}
      </Button>
    </form>
  );
}

/**
 * Who was in the room. Three states, not two — `attended` stays null until Nina
 * says either way, so "not marked yet" never reads as "didn't come".
 */
export function AttendanceForm({
  submissionId,
  sessionId,
  memberId,
  attended,
}: {
  submissionId: string | null;
  sessionId: string;
  memberId: string;
  attended: boolean | null;
}) {
  const [state, formAction] = useActionState<SessionState, FormData>(
    setAttendance,
    null,
  );

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-center gap-3 border-t border-navy/10 pt-3">
      <Identity submissionId={submissionId} sessionId={sessionId} memberId={memberId} />

      <span className="text-caption text-navy/60">
        {attended === null ? "Were they there?" : attended ? "Was there." : "Didn't come."}
      </span>

      {attended !== true ? (
        <Button type="submit" name="attended" value="yes" size="sm" variant="secondary">
          Mark as there
        </Button>
      ) : null}
      {attended !== false ? (
        <Button type="submit" name="attended" value="no" size="sm" variant="ghost">
          Mark absent
        </Button>
      ) : null}
      {attended !== null ? (
        <Button type="submit" name="attended" value="" size="sm" variant="ghost">
          Clear
        </Button>
      ) : null}

      <FormMessage error={state?.error} notice={state?.notice} />
    </form>
  );
}

/** Where the clipped replay ended up — a manual production step, so a note. */
export function ReplayNoteForm({
  sessionId,
  note,
}: {
  sessionId: string;
  note: string | null;
}) {
  const [state, formAction] = useActionState<SessionState, FormData>(
    saveReplayNote,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="session_id" value={sessionId} />
      <TextArea
        label="Replay note"
        name="replay_note"
        rows={2}
        required={false}
        defaultValue={note ?? ""}
        hint="Where the clipped recording ended up. Getting it into the library is a separate step."
      />
      <FormMessage error={state?.error} notice={state?.notice} />
      <Button type="submit" size="sm" variant="secondary" className="self-start">
        Save note
      </Button>
    </form>
  );
}
