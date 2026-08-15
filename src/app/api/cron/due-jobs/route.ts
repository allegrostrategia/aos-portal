import { NextResponse, type NextRequest } from "next/server";

import { runDueJobs } from "@/lib/jobs/runner";

/**
 * The daily cron entry point (see `vercel.json`).
 *
 * Vercel's Hobby plan runs cron once a day, which is all this needs: the job
 * table holds whatever precision the work requires, and the cron only ever asks
 * "what's due on or before today".
 *
 * Authenticated with CRON_SECRET, which Vercel sends as a bearer token. Without
 * that check this is a public endpoint that emails members on demand.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    // Refuse rather than run unauthenticated. A misconfigured deployment should
    // do nothing, not something.
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    const summary = await runDueJobs(today);
    return NextResponse.json({ today, ...summary });
  } catch (cause) {
    // A cron failure is only ever read in a log, so it has to say what happened.
    // An unhandled throw here gives a stack trace and a 500; a missing
    // SUPABASE_SERVICE_ROLE_KEY should read as exactly that.
    const message = cause instanceof Error ? cause.message : String(cause);
    return NextResponse.json({ today, error: message }, { status: 500 });
  }
}
