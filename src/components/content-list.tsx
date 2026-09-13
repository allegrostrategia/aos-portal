import { FORMAT_LABEL, type TrainingContent } from "@/lib/library/queries";

import { NumberedRow, SectionTitle } from "@/components/ui/card";

/**
 * A station's content, in L'Editoriale's three sections.
 *
 * The brief renames and regroups what §6 asked for:
 *
 *  · **Lessons** — the trainings you watch or listen to;
 *  · **Tools** — the PDFs, spreadsheets and templates you open and use
 *    (was "Resources");
 *  · **Hot seat replays & audio** — real builds from live sessions and Nina's
 *    weekly drops, kept as their own small section so nobody mistakes
 *    somebody's actual working for a structured lesson.
 *
 * The split between the first two is by format, not by a new column: a
 * training is a lesson if it plays and a tool if it opens. That is what the
 * distinction has always meant in the library, so it doesn't need a second
 * source of truth to say so.
 *
 * ★ still marks the subset where a real artifact gets built rather than
 * understood — which doubles as the menu of what tends to come up as a live
 * build.
 */

type Section = {
  key: string;
  title: string;
  note: string | null;
  pick: (item: TrainingContent) => boolean;
};

const SECTIONS: Section[] = [
  {
    key: "lessons",
    title: "Lessons",
    note: null,
    pick: (i) => i.kind === "training" && (i.format === "video" || i.format === "audio"),
  },
  {
    key: "tools",
    title: "Tools",
    note: "Open these and use them in your own business.",
    pick: (i) => i.kind === "training" && (i.format === "pdf" || i.format === "spreadsheet"),
  },
  {
    key: "replays",
    title: "Hot seat replays & audio",
    note: "Real builds from live sessions, and Nina's short weekly drops.",
    pick: (i) => i.kind === "replay" || i.kind === "audio_drop",
  },
];

function Tick({ done }: { done: boolean }) {
  return (
    <span
      aria-label={done ? "Completed" : undefined}
      className={`flex size-6 items-center justify-center rounded-full border ${
        done ? "border-orange bg-orange text-white" : "border-ink/20 text-transparent"
      }`}
    >
      <svg aria-hidden viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="m4.5 10.5 3.5 3.5 7.5-8" />
      </svg>
    </span>
  );
}

export function ContentList({
  items,
  completed = new Set<string>(),
}: {
  items: TrainingContent[];
  /** Content ids the member has marked complete. */
  completed?: Set<string>;
}) {
  if (items.length === 0) {
    return <p className="text-small text-ink/70">Nothing in this room yet.</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      {SECTIONS.map((section) => {
        const inSection = items.filter(section.pick);
        if (inSection.length === 0) return null;

        const done = inSection.filter((i) => completed.has(i.id)).length;

        return (
          <div key={section.key}>
            <SectionTitle
              aside={
                section.key === "lessons" ? (
                  <span className="font-mono tabular-nums">
                    {done}/{inSection.length}
                  </span>
                ) : undefined
              }
            >
              {section.title}
            </SectionTitle>
            {section.note ? (
              <p className="-mt-2 mb-3 text-caption text-ink/55">{section.note}</p>
            ) : null}

            <ol className="-mx-2 flex flex-col">
              {inSection.map((item, index) => {
                const meta = [
                  item.duration_minutes ? `${item.duration_minutes} min` : null,
                  FORMAT_LABEL[item.format],
                  item.is_hot_seat_buildable ? "★ Buildable" : null,
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <NumberedRow
                    key={item.id}
                    index={index + 1}
                    title={item.title}
                    meta={meta}
                    href={`/library/${item.slug}`}
                    trailing={
                      section.key === "lessons" ? <Tick done={completed.has(item.id)} /> : undefined
                    }
                  />
                );
              })}
            </ol>
          </div>
        );
      })}
    </div>
  );
}
