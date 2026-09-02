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
 * The status callback exists for the same reason: a subscription that never
 * connects should say so somewhere, rather than looking identical to a quiet
 * channel.
 */
export function LiveThread({ channelId }: { channelId: string }) {
  const router = useRouter();

  useEffect(() => {
    let disposed = false;
    let channel: RealtimeChannel | null = null;
    const supabase = createClient();

    const markRead = () => {
      void markChannelRead(channelId).catch(() => {
        // A read marker that didn't save costs one extra email. Not worth
        // interrupting somebody's reading to tell them.
      });
    };

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (disposed) return;

      if (!data.session) {
        console.warn("[chat] no session — live updates are off for this tab");
        return;
      }

      // Hand the socket the member's token, so RLS resolves to them rather than
      // to anon and the subscription actually receives their messages.
      await supabase.realtime.setAuth(data.session.access_token);
      if (disposed) return;

      channel = supabase
        .channel(`chat:${channelId}`)
        .on(
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
        )
        .subscribe((status, error) => {
          if (status === "SUBSCRIBED") return;
          // CHANNEL_ERROR usually means the table isn't in the publication;
          // TIMED_OUT means the socket never opened at all.
          console.warn(`[chat] realtime ${status}`, error ?? "");
        });
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
      if (channel) void supabase.removeChannel(channel);
    };
  }, [channelId, router]);

  return null;
}
