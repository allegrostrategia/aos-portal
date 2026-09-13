"use client";

import { useState, useTransition } from "react";

import { setLessonComplete } from "@/lib/library/completion-actions";
import { Button } from "@/components/ui/button";

/**
 * "Mark as complete" — L'Editoriale's orange pill at the foot of a lesson.
 *
 * Optimistic: the tick flips immediately and reverts if the save is refused.
 * Rendered from server state on load, so a refresh shows the truth rather than
 * whatever the last tap left on screen.
 */
export function CompleteButton({
  contentId,
  contentSlug,
  stationSlug,
  initial,
}: {
  contentId: string;
  contentSlug: string;
  stationSlug: string;
  initial: boolean;
}) {
  const [complete, setComplete] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle() {
    const next = !complete;
    setComplete(next);
    setError(null);
    start(async () => {
      const result = await setLessonComplete(contentId, next, stationSlug, contentSlug);
      if (!result.ok) {
        setComplete(!next);
        setError(result.message);
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        onClick={toggle}
        disabled={pending}
        variant={complete ? "secondary" : "primary"}
        size="lg"
        aria-pressed={complete}
        className="w-full sm:w-auto"
      >
        {complete ? (
          <>
            <Tick /> Completed
          </>
        ) : (
          "Mark as complete"
        )}
      </Button>
      {complete ? (
        <p className="text-caption text-ink/55">Tap again to take the tick back.</p>
      ) : null}
      {error ? <p className="text-caption text-deep-red">{error}</p> : null}
    </div>
  );
}

function Tick() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </svg>
  );
}
