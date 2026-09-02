"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { markChannelRead } from "@/lib/chat/actions";

/**
 * Keeps an open conversation current, and marks it read while it's open.
 *
 * On a new message it calls `router.refresh()` rather than appending the payload
 * to a client-side list. The payload is the raw row — no sender name, no
 * formatting — so rendering it here would mean a second copy of the message
 * markup that could drift from the server's, and a name lookup per message.
 * Re-fetching the server component costs a round trip and keeps one renderer.
 *
 * RLS applies to the subscription itself, so a member is only woken by messages
 * in channels they could already read.
 *
 * Marking read on mount and on every new message is what stops the email
 * notification firing at somebody who is sitting in the conversation.
 */
export function LiveThread({ channelId }: { channelId: string }) {
  const router = useRouter();

  useEffect(() => {
    void markChannelRead(channelId);

    const supabase = createClient();
    const channel = supabase
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
          void markChannelRead(channelId);
          router.refresh();
        },
      )
      .subscribe();

    // Someone reading a long thread with the tab open for an hour should not be
    // emailed about it, so the marker moves again when they come back to it.
    const onVisible = () => {
      if (document.visibilityState === "visible") void markChannelRead(channelId);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [channelId, router]);

  return null;
}
