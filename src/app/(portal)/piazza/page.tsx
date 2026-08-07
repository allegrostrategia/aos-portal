import type { Metadata } from "next";

import { getCurrentMember } from "@/lib/auth/member";

export const metadata: Metadata = {
  title: "Piazza — aOS",
};

const GREETING_DATE = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/**
 * Placeholder. The real Piazza — hours reclaimed, the proof cluster, this week's
 * log, the mini La Strada map, the draw card — is Step 4. This exists so there's
 * somewhere to land after signing in, and so the status tiering is visible while
 * the rest gets built.
 */
export default async function PiazzaPage() {
  // Non-null: the portal layout has already run requireMember().
  const member = (await getCurrentMember())!;

  const firstName = member.full_name.split(" ")[0];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:py-14">
      <p className="font-mono text-xs tracking-widest text-navy/50 uppercase">
        {GREETING_DATE.format(new Date())}
      </p>
      <h1 className="font-display mt-2 text-4xl italic text-navy sm:text-5xl">
        Buongiorno, {firstName}
      </h1>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <section className="rounded-lg border border-navy/10 bg-white/60 p-5">
          <p className="font-mono text-xs tracking-widest text-navy/50 uppercase">
            Your stage
          </p>
          <p className="font-display mt-2 text-2xl italic text-navy">
            {member.status === "onboarding" ? "Onboarding" : "Active"}
          </p>
          <p className="mt-2 text-sm text-navy/70">
            {member.status === "onboarding"
              ? "Time tracking, your audit and the member directory are open to you now. The full library, hot seat and peer pairing unlock once you’re active."
              : "Everything is open to you — the full library, hot seat and peer pairing."}
          </p>
        </section>

        <section className="rounded-lg border border-navy/10 bg-white/60 p-5">
          <p className="font-mono text-xs tracking-widest text-navy/50 uppercase">
            Member since
          </p>
          <p className="font-mono mt-2 text-2xl text-navy">
            {new Intl.DateTimeFormat("en-GB", {
              month: "long",
              year: "numeric",
            }).format(new Date(member.join_date))}
          </p>
          {member.contract_term_end_date ? (
            <p className="mt-2 text-sm text-navy/70">
              Your first six months run to{" "}
              {new Intl.DateTimeFormat("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              }).format(new Date(member.contract_term_end_date))}
              .
            </p>
          ) : null}
        </section>
      </div>

      <p className="mt-8 text-sm text-navy/50">
        Piazza proper arrives in Step 4 — this is the landing point while auth gets
        wired up.
      </p>
    </main>
  );
}
