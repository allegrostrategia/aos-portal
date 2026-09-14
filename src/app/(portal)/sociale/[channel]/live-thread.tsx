"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { markChannelRead } from "@/lib/chat/actions";

/**
 * Keeps an open conversation current, and marks it read while it's open.
 *
 * On a new message it calls `router.refresh()` rather than appending the payload
 * to a client-side list. The payload is the raw row — no sender name, no
 * formatting — so rendering it here would mean a second copy of the message
 * markup that could drift from the server's.
 *
 * **The socket authenticates separately from the rest of the client.**
 * `createBrowserClient` reads the session from cookies for queries, but the
 * realtime connection opens anonymous unless it is handed a token. With RLS on
 * `chat_messages`, an anonymous subscriber is sent nothing at all — and
 * `subscribe()` still reports SUBSCRIBED, so it fails completely silently. That
 * is what `setAuth` below is for, and it is the whole reason live updates can
 * look correctly configured and still never arrive.
 *
 * **SUBSCRIBED is not "subscribed to Postgres".** It is the join acknowledgement.
 * The backend creates the Postgres subscription afterwards and reports the
 * outcome as a `system` message; a failure there ("Unable to subscribe to
 * changes with given parameters") never reaches the status callback. From
 * 13 to 14 Sep 2026 every conversation was in exactly that state, because
 * `message_reactions` was missing from the Realtime publication, and nothing
 * printed anywhere. Hence the `system` listener, and hence **one channel per
 * table**: Realtime refuses a whole channel when any one binding on it cannot
 * be served, so reactions and messages sharing a channel meant a reactions
 * problem took messages down with it.
 */
export function LiveThread({ channelId }: { channelId: string }) {
  const router = useRouter();

  useEffect(() => {
    let disposed = false;
    const channels: RealtimeChannel[] = [];
    const supabase = createClient();

    const markRead = () => {
      void markChannelRead(channelId).catch(() => {
        // A read marker that didn't save costs one extra email. Not worth
        // interrupting somebody's reading to tell them.
      });
    };

    // A status callback, and a system listener for the part the status
    // callback can't see. Anything but a clean subscribe says so in the
    // console, so the next time this breaks it is a warning, not a mystery.
    const watch = (channel: RealtimeChannel, label: string) =>
      channel
        .on("system", {}, (payload: { status?: string; message?: string }) => {
          if (payload.status === "error") {
            console.warn(`[chat] realtime ${label}: ${payload.message ?? "error"}`);
          }
        })
        .subscribe((status, error) => {
          if (status === "SUBSCRIBED") return;
          // CHANNEL_ERROR usually means a binding the server rejected outright;
          // TIMED_OUT means the socket never opened at all.
          console.warn(`[chat] realtime ${label} ${status}`, error ?? "");
        });

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (disposed) return;

      if (!data.session) {
        console.warn("[chat] no session. Live updates are off for this tab");
        return;
      }

      // Hand the socket the member's token, so RLS resolves to them rather than
      // to anon and the subscription actually receives their messages.
      await supabase.realtime.setAuth(data.session.access_token);
      if (disposed) return;

      channels.push(
        watch(
          supabase.channel(`chat:${channelId}`).on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "chat_messages",
              filter: `channel_id=eq.${channelId}`,
            },
            () => {
              markRead();
              router.refresh();
            },
          ),
          "messages",
        ),
      );

      // Reactions on their own channel (see above). The reactions table
      // doesn't carry a channel id, so this is unfiltered; a refresh is cheap
      // and the table is small, so every reaction in the publication triggers
      // one. Both tables are in the publication by migration
      // (20260914150000), and the schema test asserts it.
      channels.push(
        watch(
          supabase.channel(`reactions:${channelId}`).on(
            "postgres_changes",
            { event: "*", schema: "public", table: "message_reactions" },
            () => router.refresh(),
          ),
          "reactions",
        ),
      );
    })();

    markRead();

    // Someone reading a long thread with the tab open should not be emailed
    // about it, so the marker moves again when they come back to it.
    const onVisible = () => {
      if (document.visibilityState === "visible") markRead();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      for (const channel of channels) void supabase.removeChannel(channel);
    };
  }, [channelId, router]);

  return null;
}
