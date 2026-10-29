"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { formatSessionTime } from "@/lib/time-zone";
import {
  publishLaunch,
  sendLaunchUpdate,
  unpublishLaunch,
  type LaunchState,
} from "@/lib/reporting/launch-actions";

/**
 * Sending a launch to the client, and taking it back.
 *
 * The same shape as a month's control and the same route through —
 * unpublish, fix, republish — because a published launch is as read-only
 * as a published month. Publishing still sends nothing: the next monthly
 * report is where it gets mentioned, which is one email a month rather
 * than two (Nina's decision 10, unchanged).
 *
 * **What is new is "Send update to client"** (her decision 12,
 * 28 October). A launch's figures carry on arriving for weeks after the
 * cart shuts, and there was no way to say so without waiting for the
 * month. Pressed by hand, never by a save.
 *
 * Drawn for Nina alone. A team member never sees a button they cannot
 * press, and the database refuses it independently if they find one.
 */
export function LaunchPublishControl({
  launchId,
  name,
  publishedAt,
  /** Only a retainer client has somebody to email about it. */
  canEmailClient,
  updateEmailSentAt,
}: {
  launchId: string;
  name: string;
  publishedAt: string | null;
  canEmailClient: boolean;
  /** When the update last went. Null means never. */
  updateEmailSentAt: string | null;
}) {
  const [state, action] = useActionState<LaunchState, FormData>(
    publishedAt ? unpublishLaunch : publishLaunch,
    null,
  );

  return (
    <Card className="mt-6">
      <SectionTitle>{publishedAt ? "Published" : "Ready to publish?"}</SectionTitle>
      <p className="text-body text-ink/70">
        {publishedAt
          ? `${name} is visible to the client. Take it back to draft if something needs fixing.`
          : `${name} is a draft. Nothing in it is visible to the client until you publish.`}
      </p>
      <form action={action} className="mt-4 flex flex-wrap items-center gap-3">
        <input type="hidden" name="launch_id" value={launchId} />
        <PublishButton published={Boolean(publishedAt)} />
        <p
          aria-live="polite"
          className={`text-small ${state?.error ? "text-deep-red" : "text-ink/60"}`}
        >
          {state?.error ?? state?.notice ?? ""}
        </p>
      </form>
      <p className="mt-3 text-caption text-ink/50">
        Publishing a launch sends no email. The next monthly report is where
        the client hears about it.
      </p>

      {publishedAt && canEmailClient ? (
        <SendUpdate launchId={launchId} sentAt={updateEmailSentAt} />
      ) : null}
    </Card>
  );
}

/**
 * The one email a launch can send, and only when somebody asks for it.
 *
 * Its own form inside the card rather than a second button in the first
 * one: two submits in one form means the wrong one fires on Enter, and
 * the wrong one here emails a client.
 */
function SendUpdate({ launchId, sentAt }: { launchId: string; sentAt: string | null }) {
  const [state, action] = useActionState<LaunchState, FormData>(sendLaunchUpdate, null);

  return (
    <form action={action} className="mt-5 border-t border-ink/8 pt-5">
      <input type="hidden" name="launch_id" value={launchId} />
      <p className="text-body text-ink/70">
        Figures still arriving? Tell the client the tracker has moved. The
        email carries no numbers, just a link.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <SendButton />
        <p
          aria-live="polite"
          className={`text-small ${state?.error ? "text-deep-red" : "text-ink/60"}`}
        >
          {state?.error ?? state?.notice ?? ""}
        </p>
      </div>
      {/* When it last went, under the button, so nobody sends twice in an
          afternoon (Dom, 29 October). Read from the launch rather than
          from this form's state, so it survives a reload and is still
          right for whoever opens the page next. */}
      <p className="mt-3 text-caption text-ink/55">
        {sentAt
          ? `Last sent ${formatSessionTime(sentAt)}.`
          : "Not sent yet."}
      </p>
    </form>
  );
}

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? "Sending…" : "Send update to client"}
    </Button>
  );
}

function PublishButton({ published }: { published: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={published ? "secondary" : "primary"} disabled={pending}>
      {pending
        ? published
          ? "Taking it back…"
          : "Publishing…"
        : published
          ? "Unpublish to make changes"
          : "Publish this launch"}
    </Button>
  );
}

/** What a published launch's setup screen says instead of letting you type. */
export function LaunchLock({
  launchId,
  name,
  canUnpublish,
}: {
  launchId: string;
  name: string;
  canUnpublish: boolean;
}) {
  const [state, action] = useActionState<LaunchState, FormData>(unpublishLaunch, null);

  return (
    <Card className="mb-6">
      <SectionTitle>{name} has gone out</SectionTitle>
      <p className="text-body text-ink/80">
        The client has this launch report, so it is read-only. To correct
        something, take it back to draft, make the change, and publish again.
        Its status is the one thing you can still change.
      </p>

      {canUnpublish ? (
        <form action={action} className="mt-4 flex flex-wrap items-center gap-3">
          <input type="hidden" name="launch_id" value={launchId} />
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
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Taking it back…" : "Unpublish to make changes"}
    </Button>
  );
}
