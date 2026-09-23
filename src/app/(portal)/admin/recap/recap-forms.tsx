"use client";

import { useActionState, useState } from "react";

import { saveRecap, sendRecap, type RecapState } from "@/lib/admin/recap-actions";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, SubmitButton, TextArea } from "@/components/ui/form";

/**
 * The source block, with the one button this screen exists for.
 *
 * `navigator.clipboard` where it is available, and the text itself on screen
 * regardless — a copy button that silently does nothing behind a permission
 * prompt would be worse than no button, and selecting it by hand must always
 * be possible.
 */
export function SourceBlock({ source }: { source: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(source)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
        >
          {copied ? "Copied" : "Copy it all"}
        </Button>
        <p className="text-caption text-ink/60">
          Paste it into Claude, write the recap there, bring the finished text back below.
        </p>
      </div>

      <pre className="max-h-96 overflow-auto rounded-xl bg-cream-deep p-4 font-mono text-caption leading-relaxed whitespace-pre-wrap text-ink/85">
        {source}
      </pre>
    </div>
  );
}

export function RecapForm({
  memberId,
  month,
  body,
  personalLine,
  sent,
}: {
  memberId: string;
  month: string;
  body: string;
  personalLine: string;
  sent: boolean;
}) {
  const [state, formAction] = useActionState<RecapState, FormData>(saveRecap, null);

  if (sent) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-small text-ink/70">
          Sent, so it reads the same to them as it does here. Anything that needs
          correcting is a message, not a rewrite.
        </p>
        {personalLine ? (
          <p className="rounded-lg bg-cream-deep px-3 py-2 text-small text-ink/80">
            Subject: {personalLine}
          </p>
        ) : null}
        <pre className="rounded-xl bg-cream-deep p-4 text-body leading-relaxed whitespace-pre-wrap text-ink">
          {body}
        </pre>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="member_id" value={memberId} />
      <input type="hidden" name="recap_month" value={month} />
      {/* One sentence, written per member. It is the subject line and the
          email's opening, and it is where anything drawn from their own month
          belongs — a sentence about one person's September can't be a
          template. */}
      <Field
        label="Your line"
        name="personal_line"
        defaultValue={personalLine}
        maxLength={120}
        placeholder="One enquiry nearly slipped through again & this time, it didn't."
        hint="The email's subject and first line, in your words. Under 120 characters. Leave it blank and the email falls back to “Your September review”."
      />
      <TextArea
        label="The recap, as they'll read it"
        name="body"
        rows={14}
        defaultValue={body}
        hint="Paste the finished text. Saving doesn't send it — nothing reaches them until you press Send."
      />
      <FormMessage error={state?.error} notice={state?.notice} />
      <SubmitButton full={false}>Save the draft</SubmitButton>
    </form>
  );
}

export function SendForm({
  memberId,
  month,
  ready,
}: {
  memberId: string;
  month: string;
  ready: boolean;
}) {
  const [state, formAction] = useActionState<RecapState, FormData>(sendRecap, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="member_id" value={memberId} />
      <input type="hidden" name="recap_month" value={month} />
      <p className="text-small text-ink/70">
        Sending emails it to them and puts the card on their Piazza. It can&rsquo;t
        be unsent or edited afterwards.
      </p>
      <FormMessage error={state?.error} notice={state?.notice} />
      <SubmitButton full={false} disabled={!ready}>
        Send it
      </SubmitButton>
    </form>
  );
}
