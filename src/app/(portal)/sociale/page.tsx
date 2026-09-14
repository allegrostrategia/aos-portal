import type { Metadata } from "next";

import { RoomList } from "@/components/chat/room-list";
import { Card, PageHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Piazza Sociale — aOS" };

/**
 * Piazza Sociale (§10): chat and the member directory, both utilities reached
 * for constantly rather than destinations arrived at.
 *
 * L'Editoriale: on a phone this is the room list, and a room opens
 * full-screen with a back arrow — the drill-in the brief asks for, which is
 * just what two routes already did. On desktop the list stays on the left and
 * the thread opens beside it; here, with no room chosen, the right-hand side
 * says so rather than sitting empty.
 */
export default async function SocialePage() {
  return (
    <main className="flex-1 py-6 sm:py-10">
      <PageHeader title="Piazza Sociale" tagline="Real conversations. Lasting progress." />

      <div className="grid min-w-0 gap-5 lg:grid-cols-[22rem_1fr]">
        <RoomList />
        <Card className="hidden items-center justify-center text-center lg:flex">
          <p className="max-w-xs text-small text-ink/60">
            Pick a room. Type or talk — a voice note often says in twenty seconds
            what a paragraph doesn&rsquo;t.
          </p>
        </Card>
      </div>
    </main>
  );
}
