import {
  FORMAT_LABEL,
  JOB_LABEL,
  type TrainingContent,
} from "@/lib/library/queries";
import Link from "next/link";

import { Badge, Eyebrow } from "@/components/ui/card";

/**
 * A station's content.
 *
 * §6 asks for three things this handles:
 *
 *  · replays are visually distinct from formal trainings, so nobody mistakes
 *    somebody's actual live build for a structured lesson;
 *  · the format is a badge shown *before* clicking in, so nobody opens a
 *    spreadsheet expecting a video;
 *  · ★ marks the subset where a real artifact gets built rather than understood
 *    — which doubles as the menu of what tends to come up as a live build.
 *
 * Grouped by kind rather than interleaved, because "distinct treatment" means
 * you can tell at a glance which shelf you're looking at.
 */

const GROUPS = [
  {
    kind: "training" as const,
    title: "Trainings",
    note: null,
  },
  {
    kind: "replay" as const,
    title: "Hot seat replays",
    note: "Real builds from live sessions — someone's actual working, not a lesson.",
  },
  {
    kind: "audio_drop" as const,
    title: "Nina's audio drops",
    note: "Short, unscripted, weekly.",
  },
];

function ContentRow({ item }: { item: TrainingContent }) {
  return (
    <li>
      <Link
        href={`/library/${item.slug}`}
        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 rounded-lg border border-navy/10 bg-white/60 px-4 py-3 transition hover:border-navy/25"
      >
        <div className="min-w-0">
          <p className="text-body text-navy">
            {item.is_hot_seat_buildable ? (
              <span
                title="A real artifact gets built in this one"
                className="text-orange"
              >
                ★{" "}
              </span>
            ) : null}
            {item.title}
          </p>
          {item.description ? (
            <p className="mt-1 text-small text-navy/70">{item.description}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Badge>{FORMAT_LABEL[item.format]}</Badge>
          {item.duration_minutes ? (
            <span className="font-mono text-caption text-navy/50">
              {item.duration_minutes}m
            </span>
          ) : null}
          {item.job ? <Badge tone="gold">{JOB_LABEL[item.job]}</Badge> : null}
        </div>
      </Link>
    </li>
  );
}

export function ContentList({ items }: { items: TrainingContent[] }) {
  if (items.length === 0) {
    return (
      <p className="text-small text-navy/70">
        Nothing in this room yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {GROUPS.map((group) => {
        const inGroup = items.filter((item) => item.kind === group.kind);
        if (inGroup.length === 0) return null;

        return (
          <div key={group.kind}>
            <Eyebrow>{group.title}</Eyebrow>
            {group.note ? (
              <p className="mt-1 text-caption text-navy/60">{group.note}</p>
            ) : null}
            <ul className="mt-2 flex flex-col gap-2">
              {inGroup.map((item) => (
                <ContentRow key={item.id} item={item} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
