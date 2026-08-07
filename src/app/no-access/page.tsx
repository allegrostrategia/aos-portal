import type { Metadata } from "next";

import { getCurrentMember } from "@/lib/auth/member";
import { signOut } from "@/lib/auth/actions";

export const metadata: Metadata = {
  title: "aOS",
};

/**
 * The one screen a cancelled member can still reach, and where an authenticated
 * user with no member record lands.
 *
 * This is why `members_select_own` deliberately has no status condition: without
 * it, a cancelled member couldn't read their own row, and the portal would just
 * appear broken instead of explaining itself.
 */
export default async function NoAccessPage() {
  const member = await getCurrentMember();

  const cancelled = member?.status === "cancelled";

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-10 sm:py-16">
      <div className="w-full max-w-md text-center">
        <p className="font-mono text-[0.7rem] tracking-[0.25em] text-orange uppercase">
          Allegro Strategia
        </p>
        <h1 className="font-display mt-3 text-3xl italic text-navy">
          {cancelled ? "Your membership has ended" : "Your account isn’t ready yet"}
        </h1>

        <p className="mt-4 text-sm text-navy/70">
          {cancelled ? (
            <>
              Nothing has been deleted — your logs, your roadmap and everything in
              your Archivio are exactly where you left them. Rejoin whenever
              you&rsquo;re ready and it will all still be there.
            </>
          ) : (
            <>
              You&rsquo;re signed in, but there&rsquo;s no membership attached to
              this address yet. If you&rsquo;ve just joined, this usually means
              your record is still being set up.
            </>
          )}
        </p>

        <p className="mt-4 text-sm text-navy/70">
          Email{" "}
          <a
            href="mailto:hello@allegrostrategia.com"
            className="underline decoration-orange decoration-2 underline-offset-4"
          >
            hello@allegrostrategia.com
          </a>{" "}
          and we&rsquo;ll sort it out.
        </p>

        <form action={signOut} className="mt-8">
          <button
            type="submit"
            className="text-sm text-navy/60 underline underline-offset-4 transition hover:text-navy"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
