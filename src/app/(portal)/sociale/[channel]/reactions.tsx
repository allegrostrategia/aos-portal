"use client";

import { useState, useTransition } from "react";

import { toggleReaction } from "@/lib/chat/reaction-actions";
import {
  REACTION_EMOJI,
  type ReactionEmoji,
  type ReactionSummary,
} from "@/lib/chat/reactions";

/**
 * The four reactions under a message (L'Editoriale §4).
 *
 * Existing reactions show as counted pills; the four choices appear on
 * hover/focus on a pointer device and are always present on touch, where
 * hover isn't a thing. Optimistic — the pill flips immediately and reverts if
 * the save is refused. Realtime picks up other people's reactions the same way
 * it picks up their messages, via the thread's refresh.
 */
export function Reactions({
  messageId,
  initial,
  mine,
}: {
  messageId: string;
  initial: ReactionSummary[];
  /** Whether this is the member's own message — reactions on your own words
   *  are allowed, just not the first thing offered. */
  mine: boolean;
}) {
  const [summary, setSummary] = useState<ReactionSummary[]>(initial);
  const [pending, start] = useTransition();

  function tap(emoji: ReactionEmoji) {
    const current = summary.find((s) => s.emoji === emoji);
    const on = !(current?.mine ?? false);
    const before = summary;

    // Optimistic update, in the fixed order.
    const next = REACTION_EMOJI.map((e) => {
      const s = summary.find((x) => x.emoji === e) ?? { emoji: e, count: 0, mine: false };
      if (e !== emoji) return s;
      return { emoji: e, count: s.count + (on ? 1 : -1), mine: on };
    }).filter((s) => s.count > 0);
    setSummary(next);

    start(async () => {
      const result = await toggleReaction(messageId, emoji, on);
      if (!result.ok) setSummary(before);
    });
  }

  return (
    <div className={`group/reactions mt-1.5 flex flex-wrap items-center gap-1 ${mine ? "justify-end" : ""}`}>
      {summary.map((s) => (
        <button
          key={s.emoji}
          type="button"
          onClick={() => tap(s.emoji)}
          disabled={pending}
          aria-pressed={s.mine}
          aria-label={`${s.emoji} ${s.count}${s.mine ? ", including you" : ""}`}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption transition ${
            s.mine
              ? "border-orange/50 bg-orange/10 text-ink"
              : "border-ink/10 bg-card text-ink/80 hover:border-ink/25"
          }`}
        >
          <span aria-hidden>{s.emoji}</span>
          <span className="font-mono tabular-nums">{s.count}</span>
        </button>
      ))}

      {/* The picker: the four, minus any already showing as pills. Visible on
          touch devices always; on pointer devices, on hover or focus. */}
      <span className="inline-flex gap-0.5 opacity-100 transition [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/reactions:opacity-100 [@media(hover:hover)]:focus-within:opacity-100">
        {REACTION_EMOJI.filter((e) => !summary.some((s) => s.emoji === e)).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => tap(e)}
            disabled={pending}
            aria-label={`React with ${e}`}
            className="flex size-7 items-center justify-center rounded-full text-[0.95rem] transition hover:bg-cream-deep"
          >
            <span aria-hidden>{e}</span>
          </button>
        ))}
      </span>
    </div>
  );
}
