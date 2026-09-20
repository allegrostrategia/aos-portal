"use client";

import { useActionState, useState } from "react";

import { saveAvailability, type PairingState } from "@/lib/pairing/actions";
import { dateLabelShort, hourLabel, parseSlot, slotsForMonth } from "@/lib/pairing/slots";
import { FormMessage, SubmitButton } from "@/components/ui/form";

/**
 * Picking the dates and times you're free (brief of 21 Sep 2026).
 *
 * One row per remaining weekday in the month, each holding ten hour chips.
 * The rows fold, because ten chips on twenty-two days is a long page on a
 * phone: a day opens when tapped, and stays open when it has picks in it. The
 * chips are real checkboxes — a closed `<details>` still submits what's inside
 * it — so the form works without JavaScript; the running count and the
 * "n picked" on each row are the only thing that needs it.
 */
export function AvailabilityForm({
  month,
  selected,
  today,
}: {
  month: string;
  selected: string[];
  /** Dates before this aren't offered. */
  today: string;
}) {
  const [state, formAction] = useActionState<PairingState, FormData>(
    saveAvailability,
    null,
  );
  const [picked, setPicked] = useState<Set<string>>(() => new Set(selected));
  const days = slotsForMonth(month, today);
  // Days with picks start open; after that, open is whatever the member left it.
  const [openDays, setOpenDays] = useState<Set<string>>(
    () => new Set(days.filter((d) => d.slots.some((s) => selected.includes(s))).map((d) => d.date)),
  );

  const toggle = (slot: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(slot);
      else next.delete(slot);
      return next;
    });

  // Picks on days no longer offered (a date that has passed) still count until
  // resaved, so they are carried through as hidden inputs rather than dropped
  // by a save that was only meant to add a day.
  const offered = new Set(days.flatMap((d) => d.slots));
  const carried = [...picked].filter((slot) => !offered.has(slot));

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="pairing_month" value={month} />
      {carried.map((slot) => (
        <input key={slot} type="hidden" name="slots" value={slot} />
      ))}

      <p className="text-small text-ink/70">
        Pick every date and time you could actually do, UK time. The more you
        pick, the better the chance of a time you both share.
      </p>

      {days.length === 0 ? (
        <p className="text-small text-ink/60">Nothing left this month to pick.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-ink/8">
          {days.map((day) => {
            const count = day.slots.filter((s) => picked.has(s)).length;
            return (
              <li key={day.date}>
                <details
                  open={openDays.has(day.date)}
                  onToggle={(e) => {
                    const open = e.currentTarget.open;
                    setOpenDays((prev) => {
                      if (prev.has(day.date) === open) return prev;
                      const next = new Set(prev);
                      if (open) next.add(day.date);
                      else next.delete(day.date);
                      return next;
                    });
                  }}
                  className="group"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2.5 text-small text-ink [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center gap-2">
                      <svg
                        aria-hidden
                        viewBox="0 0 20 20"
                        className="size-3.5 text-ink/45 transition-transform group-open:rotate-90"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m7.5 5 5 5-5 5" />
                      </svg>
                      <span className="font-mono tabular-nums">{dateLabelShort(day.date)}</span>
                    </span>
                    <span className={`text-caption ${count > 0 ? "font-medium text-orange" : "text-ink/45"}`}>
                      {count > 0 ? `${count} picked` : "none"}
                    </span>
                  </summary>
                  <div className="flex flex-wrap gap-2 pb-3 pl-5.5">
                    {day.slots.map((slot) => {
                      const on = picked.has(slot);
                      const hour = parseSlot(slot)?.hour ?? 0;
                      return (
                        <label key={slot} className="cursor-pointer">
                          <input
                            type="checkbox"
                            name="slots"
                            value={slot}
                            checked={on}
                            onChange={(e) => toggle(slot, e.target.checked)}
                            className="peer sr-only"
                          />
                          <span className="inline-flex h-9 min-w-14 items-center justify-center rounded-full border border-ink/15 bg-cream-deep px-3 text-small text-ink transition peer-checked:border-orange peer-checked:bg-orange peer-checked:font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-orange/40">
                            {hourLabel(hour)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-caption text-ink/60">
        <span className="font-mono tabular-nums text-ink">{picked.size}</span>{" "}
        {picked.size === 1 ? "time" : "times"} picked. Nothing picked means
        you&rsquo;re sitting this month out, which is a fine answer.
      </p>

      <FormMessage error={state?.error} notice={state?.notice} />
      <SubmitButton full={false}>Save when I&rsquo;m free</SubmitButton>
    </form>
  );
}
