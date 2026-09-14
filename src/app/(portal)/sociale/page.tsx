import { redirect } from "next/navigation";

/**
 * Piazza Sociale opens on General (round-2 brief, C4). There is no landing
 * list any more: on a phone the other rooms are a strip of chips across the
 * top of the thread, on a laptop they are the column beside it. A member
 * arriving here is in a conversation, not choosing whether to start one.
 */
export default function SocialePage() {
  redirect("/sociale/general");
}
