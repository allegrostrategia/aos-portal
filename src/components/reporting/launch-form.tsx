"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import {
  createLaunch,
  updateLaunch,
  updateLaunchStatus,
  type LaunchState,
} from "@/lib/reporting/launch-actions";
import type { LaunchRow } from "@/lib/reporting/launch-queries";

/**
 * §6.1's launch record: what it is, what it sells, and what good looks
 * like.
 *
 * One component for both jobs, because they are the same eight fields —
 * building two would be two places for a field to be forgotten. What
 * differs is genuinely small: a new launch carries no status, and an
 * existing one does.
 */
export function LaunchForm({
  workspaceId,
  launch,
  offers,
  locked,
  returnTo,
}: {
  workspaceId: string;
  /** Null when creating. */
  launch: LaunchRow | null;
  offers: { id: string; name: string }[];
  locked: boolean;
  /** The screen this form sits on, so a save can come back to it. */
  returnTo: string;
}) {
  const [state, action] = useActionState<LaunchState, FormData>(
    launch ? updateLaunch : createLaunch,
    null,
  );

  return (
    <Card>
      <SectionTitle>{launch ? "This launch" : "A new launch"}</SectionTitle>
      <form action={action} className="flex flex-col gap-4">
        {/* `createLaunch` has nowhere to come back to — it redirects to
            the setup screen it just made — so this is only read on an
            edit. Harmless either way, and one line rather than two. */}
        <input type="hidden" name="return_to" value={returnTo} />
        {launch ? (
          <input type="hidden" name="launch_id" value={launch.id} />
        ) : (
          <input type="hidden" name="workspace_id" value={workspaceId} />
        )}

        <fieldset disabled={locked} className="contents">
          <label className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-ink">Name</span>
            <input
              name="name"
              defaultValue={launch?.name ?? ""}
              required
              className="rounded-xl border border-ink/12 bg-card px-3.5 py-2.5 text-body text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/30"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-ink">
              Description <span className="text-ink/45">optional</span>
            </span>
            <input
              name="description"
              defaultValue={launch?.description ?? ""}
              className="rounded-xl border border-ink/12 bg-card px-3.5 py-2.5 text-body text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/30"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-ink">
              What it sells <span className="text-ink/45">optional</span>
            </span>
            <select
              name="offer_entity_id"
              defaultValue={launch?.offer_entity_id ?? ""}
              className="rounded-xl border border-ink/12 bg-card px-3.5 py-2.5 text-body text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/30"
            >
              <option value="">Not linked to an offer</option>
              {offers.map((offer) => (
                <option key={offer.id} value={offer.id}>
                  {offer.name}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="contents">
            <legend className="text-small font-medium text-ink">
              Sales goals <span className="text-ink/45">good, better, best</span>
            </legend>
            <div className="grid grid-cols-3 gap-3">
              {(["good", "better", "best"] as const).map((which) => (
                <label key={which} className="flex flex-col gap-1.5">
                  <span className="text-caption uppercase tracking-wide text-ink/55">
                    {which}
                  </span>
                  <input
                    name={`goal_${which}`}
                    inputMode="numeric"
                    defaultValue={launch?.[`goal_${which}`] ?? ""}
                    className="rounded-xl border border-ink/12 bg-card px-3.5 py-2.5 font-mono text-body text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/30"
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="contents">
            <legend className="text-small font-medium text-ink">
              For the planner{" "}
              <span className="text-ink/45">
                what you expect, until the launch tells you otherwise
              </span>
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-caption uppercase tracking-wide text-ink/55">
                  Show-up rate %
                </span>
                <input
                  name="planner_show_up_rate"
                  inputMode="decimal"
                  defaultValue={launch?.planner_show_up_rate ?? ""}
                  className="rounded-xl border border-ink/12 bg-card px-3.5 py-2.5 font-mono text-body text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/30"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-caption uppercase tracking-wide text-ink/55">
                  Conversion rate %
                </span>
                <input
                  name="planner_conversion_rate"
                  inputMode="decimal"
                  defaultValue={launch?.planner_conversion_rate ?? ""}
                  className="rounded-xl border border-ink/12 bg-card px-3.5 py-2.5 font-mono text-body text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/30"
                />
              </label>
            </div>
          </fieldset>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <SaveButton label={launch ? "Save" : "Create this launch"} />
          <p
            aria-live="polite"
            className={`text-small ${state?.error ? "text-deep-red" : "text-ink/60"}`}
          >
            {state?.error ?? ""}
          </p>
        </div>
      </form>

      {launch ? <StatusForm launch={launch} returnTo={returnTo} /> : null}
    </Card>
  );
}

/**
 * §6's three statuses, in a form of their own.
 *
 * The one field a published launch leaves alone — it describes the
 * launch rather than the report, so a cart that has shut can be marked
 * shut (Nina's decision 15).
 *
 * **Its own form because a disabled field does not submit.** Inside the
 * main one, a published launch would post a status and nothing else, and
 * be refused for having no name — which is how the first build behaved.
 */
function StatusForm({ launch, returnTo }: { launch: LaunchRow; returnTo: string }) {
  const [state, action] = useActionState<LaunchState, FormData>(updateLaunchStatus, null);

  return (
    <form action={action} className="mt-5 flex flex-wrap items-end gap-3 border-t border-ink/8 pt-5">
      <input type="hidden" name="return_to" value={returnTo} />
      <input type="hidden" name="launch_id" value={launch.id} />
      <label className="flex flex-col gap-1.5">
        <span className="text-small font-medium text-ink">Status</span>
        <select
          name="status"
          defaultValue={launch.status}
          className="rounded-xl border border-ink/12 bg-card px-3.5 py-2.5 text-body text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/30"
        >
          <option value="planning">Planning</option>
          <option value="live">Live now</option>
          <option value="completed">Completed</option>
        </select>
      </label>
      <SaveButton label="Save the status" />
      <p
        aria-live="polite"
        className={`text-small ${state?.error ? "text-deep-red" : "text-ink/60"}`}
      >
        {state?.error ?? ""}
      </p>
    </form>
  );
}

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}
