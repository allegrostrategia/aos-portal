"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * The scrolling part of a room: the messages, and only the messages.
 *
 * Opens at the newest message, as a messaging app does, and follows a new
 * one in — but only if the reader was already at the bottom. Somebody who
 * has scrolled up to read something older is not yanked back down because
 * a message arrived (`LiveThread` refreshes the page on every one).
 */
export function ThreadScroll({
  count,
  className,
  children,
}: {
  /** How many messages are rendered; a change means something arrived. */
  count: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);

  // Before paint, so the room never flashes its oldest message first.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [count]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
