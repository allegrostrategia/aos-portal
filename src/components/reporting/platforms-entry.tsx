"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Badge, Card, SectionTitle } from "@/components/ui/card";
import { IconCircle } from "./icons";
import {
  retirePlatform,
  savePlatform,
  type PlatformState,
} from "@/lib/reporting/platform-actions";

/**
 * The platforms this client posts on (§5.2).
 *
 * On the Social Media entry screen rather than a settings page of its
 * own, for the same reason campaigns live on the Ads entry screen: the
 * moment you want a second platform is the moment you are looking at the
 * first one's boxes.
 *
 * **The first platform is the main one**, and the card says so, because
 * it is the one whose Followers figure the Overview shows. Never a sum —
 * followers added across platforms count the same person twice.
 */

const field =
  "w-full rounded-xl border border-ink/12 bg-card px-3.5 py-2.5 text-body text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/30";

function Save({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function PlatformsEntry({
  workspaceId,
  platforms,
  chosenId,
}: {
  workspaceId: string;
  /** Every platform, retired ones included, in the order the pill shows them. */
  platforms: { id: string; name: string; active: boolean }[];
  chosenId: string | null;
}) {
  const [state, action] = useActionState<PlatformState, FormData>(savePlatform, null);
  const [retireState, retireAction] = useActionState<PlatformState, FormData>(
    retirePlatform,
    null,
  );
  const [adding, setAdding] = useState(false);

  const live = platforms.filter((p) => p.active);
  const retired = platforms.filter((p) => !p.active);

  return (
    <Card className="mt-6">
      <SectionTitle icon={<IconCircle name="social" tone="sky" />}>
        The platforms you post on
      </SectionTitle>
      <p className="mt-1 text-small text-ink/70">
        Each one keeps its own figures, month by month. The first is the one the Overview
        shows.
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {live.map((platform, index) => (
          <li
            key={platform.id}
            className="flex flex-wrap items-center gap-2 rounded-xl bg-cream-deep px-3 py-2"
          >
            <form action={action} className="flex min-w-0 grow items-center gap-2">
              <input type="hidden" name="workspace_id" value={workspaceId} />
              <input type="hidden" name="platform_id" value={platform.id} />
              <input
                name="name"
                defaultValue={platform.name}
                aria-label={`What ${platform.name} is called`}
                className={`${field} max-w-56`}
              />
              {index === 0 ? <Badge tone="sky">Main</Badge> : null}
              {platform.id === chosenId ? (
                <span className="text-caption text-ink/55">showing</span>
              ) : null}
              <Save label="Rename" />
            </form>

            {live.length > 1 ? (
              <form action={retireAction}>
                <input type="hidden" name="workspace_id" value={workspaceId} />
                <input type="hidden" name="platform_id" value={platform.id} />
                <Button type="submit" variant="secondary" size="sm">
                  Retire
                </Button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>

      {retired.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {retired.map((platform) => (
            <li key={platform.id} className="flex items-center gap-2 px-3 text-small text-ink/60">
              <span className="truncate">{platform.name}</span>
              <Badge tone="neutral">Retired</Badge>
              <form action={retireAction}>
                <input type="hidden" name="workspace_id" value={workspaceId} />
                <input type="hidden" name="platform_id" value={platform.id} />
                <input type="hidden" name="restore" value="1" />
                <Button type="submit" variant="secondary" size="sm">
                  Use again
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <form action={action} className="mt-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="workspace_id" value={workspaceId} />
          <label className="flex grow flex-col gap-1.5">
            <span className="text-small font-medium text-ink">Add a platform</span>
            <input
              name="name"
              placeholder="LinkedIn"
              autoFocus
              className={`${field} max-w-64`}
            />
          </label>
          <Save label="Add" />
          <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="mt-4">
          <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)}>
            + Add a platform
          </Button>
        </div>
      )}

      <p aria-live="polite" className="mt-2 text-small text-deep-red">
        {state?.error ?? retireState?.error ?? ""}
      </p>
      <p aria-live="polite" className="text-small text-ink/70">
        {state?.notice ?? retireState?.notice ?? ""}
      </p>
    </Card>
  );
}
