"use client";

import { openDirectMessage } from "@/lib/chat/actions";
import { Button } from "@/components/ui/button";

/**
 * Opens the conversation with a pairing partner.
 *
 * The same find-or-create the directory uses, so a pair who message from here
 * and from the directory land in one conversation rather than two.
 */
export function OpenDirectMessage({
  memberId,
  label,
}: {
  memberId: string;
  label: string;
}) {
  return (
    <form action={openDirectMessage}>
      <input type="hidden" name="member_id" value={memberId} />
      <Button type="submit" size="sm">
        {label}
      </Button>
    </form>
  );
}
