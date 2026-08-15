"use client";

import { useActionState, useState } from "react";

import { saveRoadmap, type RoadmapState } from "@/lib/admin/roadmap-actions";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form";

export type EditorPhase = {
  title: string;
  stationSlug: string | null;
  items: string[];
};

const INPUT =
  "w-full rounded-md border border-navy/15 bg-white px-3 py-2 text-small text-navy placeholder:text-navy/40";

/**
 * Writing a member's roadmap by hand (§3: Claude drafts, Nina confirms).
 *
 * The drafting half isn't built yet, so for now this is the confirm half doing
 * both jobs — which is the right order regardless, since "AI drafts, human
 * confirms" needs somewhere to confirm before there's anything to draft.
 */
export function RoadmapEditor({
  memberId,
  memberName,
  memberEmail,
  stations,
  initialPhases,
  initialFocus,
  initialFocusStation,
  isPublished,
  hasHadHotSeat,
}: {
  memberId: string;
  memberName: string;
  memberEmail: string;
  stations: { slug: string; name: string }[];
  initialPhases: EditorPhase[];
  initialFocus: string;
  initialFocusStation: string;
  isPublished: boolean;
  /** Distinguishes "no build this month" from "never had one" in the empty state. */
  hasHadHotSeat: boolean;
}) {
  const [state, formAction] = useActionState<RoadmapState, FormData>(
    saveRoadmap,
    null,
  );

  const [phases, setPhases] = useState<EditorPhase[]>(
    initialPhases.length > 0
      ? initialPhases
      : [{ title: "", stationSlug: null, items: [""] }],
  );

  const update = (index: number, patch: Partial<EditorPhase>) =>
    setPhases((current) =>
      current.map((phase, i) => (i === index ? { ...phase, ...patch } : phase)),
    );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="member_id" value={memberId} />
      <input type="hidden" name="phases" value={JSON.stringify(phases)} />

      {/* Whose roadmap this is, stated where the work happens rather than only
          in the page title. Two members with similar names one row apart in a
          list is all it takes to publish someone else's plan to them, and the
          admin's own name at the top of the page is not a loud enough signal. */}
      <div className="rounded-xl border-2 border-orange/40 bg-blush/15 px-5 py-3">
        <p className="text-body text-navy">
          You are editing{" "}
          <strong className="font-medium">{memberName}&rsquo;s</strong> roadmap
        </p>
        <p className="font-mono mt-0.5 text-caption text-navy/60">
          {memberEmail}
        </p>
      </div>

      {/* Read-only, deliberately (§4). "Current focus" is the hot seat build —
          the one thing, drawn from real tracked time and set by that flow's own
          prep-and-confirm. The roadmap is the separate, self-paced track from
          the 1:1. Typing it here would let a stated goal masquerade as something
          the data actually showed. */}
      <Card>
        <Eyebrow>This month&rsquo;s focus — the hot seat build</Eyebrow>

        {initialFocus ? (
          <>
            <p className="font-display mt-2 text-heading text-navy italic">
              {initialFocus}
            </p>
            {initialFocusStation ? (
              <p className="mt-1 text-small text-navy/70">
                {stations.find((s) => s.slug === initialFocusStation)?.name ??
                  initialFocusStation}
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-2 text-small text-navy/70">
            {hasHadHotSeat
              ? "No build confirmed for this month yet."
              : "Their first hot seat hasn’t happened yet."}
          </p>
        )}

        <p className="mt-3 text-caption text-navy/60">
          Set through the hot seat&rsquo;s prep and confirm, from their tracked
          time — not edited here. The roadmap below is the separate, self-paced
          track.
        </p>
      </Card>

      {phases.map((phase, phaseIndex) => (
        <Card key={phaseIndex}>
          <div className="flex items-baseline justify-between gap-3">
            <Eyebrow>Phase {phaseIndex + 1}</Eyebrow>
            {phases.length > 1 ? (
              <button
                type="button"
                onClick={() =>
                  setPhases((current) =>
                    current.filter((_, i) => i !== phaseIndex),
                  )
                }
                className="text-caption text-navy/50 underline underline-offset-4 hover:text-navy"
              >
                Remove phase
              </button>
            ) : null}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input
              value={phase.title}
              onChange={(e) => update(phaseIndex, { title: e.target.value })}
              placeholder="Phase title"
              className={INPUT}
              aria-label={`Phase ${phaseIndex + 1} title`}
            />
            <select
              value={phase.stationSlug ?? ""}
              onChange={(e) =>
                update(phaseIndex, { stationSlug: e.target.value || null })
              }
              className={INPUT}
              aria-label={`Phase ${phaseIndex + 1} station`}
            >
              <option value="">No station</option>
              {stations.map((station) => (
                <option key={station.slug} value={station.slug}>
                  {station.name}
                </option>
              ))}
            </select>
          </div>

          <p className="mt-4 mb-2 text-small font-medium text-navy">
            Items
            <span className="ml-2 font-normal text-navy/50">
              these become the weekly log&rsquo;s checklist
            </span>
          </p>

          <div className="flex flex-col gap-2">
            {phase.items.map((item, itemIndex) => (
              <div key={itemIndex} className="flex items-center gap-2">
                <input
                  value={item}
                  onChange={(e) =>
                    update(phaseIndex, {
                      items: phase.items.map((existing, i) =>
                        i === itemIndex ? e.target.value : existing,
                      ),
                    })
                  }
                  placeholder="Something they can actually do"
                  className={INPUT}
                  aria-label={`Phase ${phaseIndex + 1} item ${itemIndex + 1}`}
                />
                <button
                  type="button"
                  onClick={() =>
                    update(phaseIndex, {
                      items: phase.items.filter((_, i) => i !== itemIndex),
                    })
                  }
                  className="px-2 text-navy/40 transition hover:text-navy"
                  aria-label="Remove item"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              update(phaseIndex, { items: [...phase.items, ""] })
            }
            className="mt-2 text-small text-navy underline decoration-orange decoration-2 underline-offset-4"
          >
            Add item
          </button>
        </Card>
      ))}

      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            setPhases((current) => [
              ...current,
              { title: "", stationSlug: null, items: [""] },
            ])
          }
        >
          Add phase
        </Button>
      </div>

      <FormMessage error={state?.error} notice={state?.notice} />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" name="intent" value="publish">
          {isPublished ? "Save and republish" : "Save and publish"}
        </Button>
        <Button type="submit" name="intent" value="draft" variant="secondary">
          Save as draft
        </Button>
      </div>
      <p className="text-small text-navy/60">
        A draft is invisible to the member — they only ever see a roadmap
        you&rsquo;ve published.
      </p>
    </form>
  );
}
