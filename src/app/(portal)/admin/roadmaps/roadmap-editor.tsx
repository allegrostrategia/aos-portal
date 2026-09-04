"use client";

import { useActionState, useState } from "react";

import { saveRoadmapStructure, type RoadmapState } from "@/lib/roadmap/actions";
import { WEEKS_IN_MONTH, type RoadmapMonth } from "@/lib/roadmap/shape";
import type { TrainingOption } from "@/lib/roadmap/queries";
import { FormMessage } from "@/components/ui/form";
import { Card, Eyebrow } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const INPUT =
  "w-full rounded-md border border-navy/15 bg-white px-3 py-2 text-small text-navy placeholder:text-navy/40";

/**
 * Writing a member's roadmap (§3, restructured 3 Sep).
 *
 * Months hold focuses, focuses hold actions, and each action carries the
 * training it points at and the week it's meant for. Nina works the plan out
 * with Claude outside the product — nothing here drafts anything, and there is
 * no panel waiting for a draft to arrive in.
 *
 * State is held in one object and posted as JSON rather than as a hundred named
 * fields. Nesting three levels deep in form names is the kind of thing that
 * works until somebody deletes the second focus of the first month.
 */
export function RoadmapEditor({
  memberId,
  months: initial,
  trainings,
  isPublished,
  notes,
}: {
  memberId: string;
  months: RoadmapMonth[];
  trainings: TrainingOption[];
  isPublished: boolean;
  notes: Map<string, string>;
}) {
  const [state, formAction] = useActionState<RoadmapState, FormData>(
    saveRoadmapStructure,
    null,
  );

  const [months, setMonths] = useState<RoadmapMonth[]>(
    initial.length > 0
      ? initial
      : [{ month: 1, title: "", focuses: [{ id: "", title: "", stationSlug: null, actions: [] }] }],
  );

  const update = (next: RoadmapMonth[]) => setMonths([...next]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="member_id" value={memberId} />
      <input type="hidden" name="months" value={JSON.stringify(months)} />

      {months.map((month, mi) => (
        <Card key={mi}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <Eyebrow>Month {mi + 1}</Eyebrow>
            {months.length > 1 ? (
              <button
                type="button"
                onClick={() => update(months.filter((_, i) => i !== mi))}
                className="text-caption text-navy/40 underline underline-offset-4 transition hover:text-navy"
              >
                Remove month
              </button>
            ) : null}
          </div>

          <input
            className={`${INPUT} mt-2`}
            placeholder="What this month is about"
            value={month.title}
            onChange={(e) => {
              months[mi].title = e.target.value;
              update(months);
            }}
          />

          <div className="mt-4 flex flex-col gap-4">
            {month.focuses.map((focus, fi) => (
              <div key={fi} className="rounded-lg border border-navy/10 bg-white/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className={`${INPUT} flex-1`}
                    placeholder="Focus — the thing being worked on"
                    value={focus.title}
                    onChange={(e) => {
                      months[mi].focuses[fi].title = e.target.value;
                      update(months);
                    }}
                  />
                  {month.focuses.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => {
                        months[mi].focuses = month.focuses.filter((_, i) => i !== fi);
                        update(months);
                      }}
                      className="text-caption text-navy/40 underline underline-offset-4 transition hover:text-navy"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>

                <ul className="mt-3 flex flex-col gap-3">
                  {focus.actions.map((action, ai) => (
                    <li key={ai} className="rounded-md border border-navy/10 p-2">
                      <div className="flex items-center gap-2">
                        <input
                          className={`${INPUT} flex-1`}
                          placeholder="What they actually do"
                          value={action.label}
                          onChange={(e) => {
                            months[mi].focuses[fi].actions[ai].label = e.target.value;
                            update(months);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            months[mi].focuses[fi].actions = focus.actions.filter(
                              (_, i) => i !== ai,
                            );
                            update(months);
                          }}
                          aria-label="Remove action"
                          className="text-caption text-navy/40 transition hover:text-navy"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <select
                          className={INPUT}
                          value={action.trainingId ?? ""}
                          onChange={(e) => {
                            months[mi].focuses[fi].actions[ai].trainingId =
                              e.target.value || null;
                            update(months);
                          }}
                        >
                          <option value="">No training linked</option>
                          {trainings.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title}
                            </option>
                          ))}
                        </select>

                        <select
                          className={INPUT}
                          value={action.week ?? ""}
                          onChange={(e) => {
                            months[mi].focuses[fi].actions[ai].week = e.target.value
                              ? Number(e.target.value)
                              : null;
                            update(months);
                          }}
                        >
                          <option value="">No week set</option>
                          {WEEKS_IN_MONTH.map((w) => (
                            <option key={w} value={w}>
                              Week {w}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* What the member said about it. Read-only here — it's
                          theirs, and this is the screen where Nina decides what
                          to do next from it. */}
                      {notes.get(action.id) ? (
                        <p className="mt-2 rounded-md border border-sky/40 bg-sky/10 px-2 py-1.5 text-caption text-navy/80">
                          <span className="font-medium">They said:</span>{" "}
                          {notes.get(action.id)}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="mt-2"
                  onClick={() => {
                    months[mi].focuses[fi].actions.push({
                      id: "",
                      label: "",
                      trainingId: null,
                      week: null,
                    });
                    update(months);
                  }}
                >
                  Add an action
                </Button>
              </div>
            ))}
          </div>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mt-3"
            onClick={() => {
              months[mi].focuses.push({ id: "", title: "", stationSlug: null, actions: [] });
              update(months);
            }}
          >
            Add a focus
          </Button>
        </Card>
      ))}

      <Button
        type="button"
        variant="secondary"
        className="self-start"
        onClick={() =>
          update([
            ...months,
            {
              month: months.length + 1,
              title: "",
              focuses: [{ id: "", title: "", stationSlug: null, actions: [] }],
            },
          ])
        }
      >
        Add a month
      </Button>

      <FormMessage error={state?.error} notice={state?.notice} />

      <div className="flex flex-wrap gap-3">
        <Button type="submit" name="intent" value="publish">
          {isPublished ? "Update what they see" : "Publish to them"}
        </Button>
        <Button type="submit" name="intent" value="draft" variant="secondary">
          Save as a draft
        </Button>
      </div>
    </form>
  );
}
