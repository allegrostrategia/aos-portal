import { NextResponse } from "next/server";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";

/**
 * The hot seat as a calendar file (§2: "upcoming hot seat with add-to-calendar").
 *
 * An .ics download rather than a per-provider link, because it works everywhere
 * — Apple, Google, Outlook, whatever a member actually uses — and needs no
 * integration with any of them.
 */
function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function toIcsStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  await requireMember();
  const { sessionId } = await params;

  const supabase = await createClient();
  const { data } = await supabase
    .from("hot_seat_sessions")
    .select("scheduled_for, zoom_url")
    .eq("id", sessionId)
    .maybeSingle();

  const session = data as
    | { scheduled_for: string | null; zoom_url: string | null }
    | null;

  if (!session?.scheduled_for) {
    return NextResponse.json(
      { error: "That session has no time set yet." },
      { status: 404 },
    );
  }

  const start = new Date(session.scheduled_for);
  // One hour (§5). Not stored, because the session length has never varied and a
  // column nobody sets is a column that goes stale.
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const description = session.zoom_url
    ? `Join: ${session.zoom_url}`
    : "The link appears in aOS nearer the time.";

  // CRLF line endings are required by the spec, and some clients do enforce it.
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Allegro Strategia//aOS//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:hot-seat-${sessionId}@aos.allegrostrategia.com`,
    `DTSTAMP:${toIcsStamp(new Date())}`,
    `DTSTART:${toIcsStamp(start)}`,
    `DTEND:${toIcsStamp(end)}`,
    "SUMMARY:aOS hot seat",
    `DESCRIPTION:${icsEscape(description)}`,
    ...(session.zoom_url ? [`URL:${session.zoom_url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="aos-hot-seat.ics"',
    },
  });
}
