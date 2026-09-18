"use client";

import { useState, useTransition } from "react";

import { toggleReaction } from "@/lib/chat/reaction-actions";
import {
  REACTION_EMOJI,
  type ReactionEmoji,
  type ReactionSummary,
} from "@/lib/chat/reactions";

/**
 * Reactions under a message (L'Editoriale §4; round 4, item 19).
 *
 * Existing reactions show as counted pills. The four choices are behind one
 * small "react" button per message: tap it and they appear, pick one and
 * they fold away. The first version showed all four under every message,
 * which on a phone was a row of emoji under every line of chat. Optimistic:
 * the pill flips immediately and reverts if the save is refused. Realtime
 * picks up other people's reactions via the thread's refresh.
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
  const [open, setOpen] = useState(false);
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
    setOpen(false);

    start(async () => {
      const result = await toggleReaction(messageId, emoji, on);
      if (!result.ok) setSummary(before);
    });
  }

  return (
    <div className={`mt-1.5 flex flex-wrap items-center gap-1 ${mine ? "justify-end" : ""}`}>
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

      {/* One small button opens the picker; the four appear beside it. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close reactions" : "React"}
        title="React"
        className={`flex size-7 items-center justify-center rounded-full text-ink/45 transition hover:bg-cream-deep hover:text-ink ${
          open ? "bg-cream-deep text-ink" : ""
        }`}
      >
        <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="size-4">
          <circle cx="11" cy="12" r="8" />
          <path d="M8 14.5c.8 1 1.8 1.5 3 1.5s2.2-.5 3-1.5M8.75 10h.01M13.25 10h.01" />
          <path d="M19 3v5M16.5 5.5h5" />
        </svg>
      </button>

      {open ? (
        <span className="inline-flex gap-0.5 rounded-full border border-ink/10 bg-card px-1 py-0.5 shadow-soft">
          {REACTION_EMOJI.map((e) => {
            const on = summary.find((s) => s.emoji === e)?.mine ?? false;
            return (
              <button
                key={e}
                type="button"
                onClick={() => tap(e)}
                disabled={pending}
                aria-pressed={on}
                aria-label={`${on ? "Remove" : "React with"} ${e}`}
                className={`flex size-7 items-center justify-center rounded-full text-[0.95rem] transition hover:bg-cream-deep ${
                  on ? "bg-orange/15" : ""
                }`}
              >
                <span aria-hidden>{e}</span>
              </button>
            );
          })}
        </span>
      ) : null}
    </div>
  );
}
