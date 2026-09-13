import type { Metadata } from "next";

import { getCurrentMember } from "@/lib/auth/member";
import { signOut } from "@/lib/auth/actions";
import { getHeadshotUrls } from "@/lib/directory/queries";
import { formatCalendarDate } from "@/lib/time-zone";
import { Avatar } from "@/components/avatar";
import { Card, Eyebrow, NumberedRow, Quote } from "@/components/ui/card";

export const metadata: Metadata = { title: "You — aOS" };

/**
 * You — the profile and settings screen (L'Editoriale "14 Your Profile").
 *
 * "Ciao, Nina." with member-since and the headshot, then a short list of
 * places: details, progress, help, sign out. It is the fifth nav item, so it is
 * also where the admin routes live on a phone — the bottom bar has five slots
 * and none of them is "Admin".
 *
 * Sign-out moved here from the header. The reference keeps it at the foot of
 * this screen, and a sign-out link on every page is a thing to tap by accident
 * on a phone.
 *
 * Notifications (a settings area for turning them on and off) is in the brief
 * and not here yet — it needs a preference to exist before a toggle can
 * honestly change anything. Coming with the rest of screen 10.
 */
export default async function YouPage() {
  const member = (await getCurrentMember())!;
  const headshots = await getHeadshotUrls([member.id]);
  const firstName = member.full_name.split(" ")[0];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 py-8 sm:py-10">
      <header className="mb-8 flex items-center gap-5">
        <Avatar name={member.full_name} src={headshots.get(member.id)} size="lg" />
        <div>
          <h1 className="font-display text-title font-medium text-ink">
            Ciao, {firstName}.
          </h1>
          <Eyebrow className="mt-2">
            Member since {formatCalendarDate(member.join_date)}
          </Eyebrow>
        </div>
      </header>

      <Card padded={false} className="mb-6">
        <ul className="divide-y divide-ink/6 p-2">
          <NumberedRow
            href="/onboarding/directory"
            leading={<RowIcon name="details" />}
            title="Your details"
            meta="Name, headshot and what you do — what other members see"
          />
          <NumberedRow
            href="/milestones"
            leading={<RowIcon name="progress" />}
            title="Your progress"
            meta="Hours reclaimed and the road ahead"
          />
          <NumberedRow
            href="mailto:hello@allegrostrategia.com?subject=aOS%20help"
            leading={<RowIcon name="help" />}
            title="Help & support"
            meta="Email Nina and the team"
          />
        </ul>
      </Card>

      {member.role === "admin" ? (
        <Card padded={false} className="mb-6">
          <Eyebrow className="px-6 pt-5">Admin</Eyebrow>
          <ul className="divide-y divide-ink/6 p-2">
            {[
              ["/admin/members", "Members"],
              ["/admin/hot-seat", "Sessions"],
              ["/admin/touchpoint", "Friday question"],
              ["/admin/reminders", "Emails"],
              ["/admin/library", "Library"],
              ["/admin/roadmaps", "Roadmaps"],
              ["/admin/reveal", "Reveal"],
              ["/admin/draw", "Draw"],
              ["/admin/pairing", "Pairs"],
            ].map(([href, label]) => (
              <NumberedRow key={href} href={href} title={label} />
            ))}
          </ul>
        </Card>
      ) : null}

      <form action={signOut} className="mb-10">
        <button
          type="submit"
          className="flex w-full items-center gap-4 rounded-2xl px-4 py-3.5 text-left text-body font-medium text-ink transition hover:bg-cream-deep"
        >
          <RowIcon name="signout" />
          Sign out
        </button>
      </form>

      <Quote className="text-ink/70">Same dreams. More done.</Quote>
    </main>
  );
}

function RowIcon({ name }: { name: "details" | "progress" | "help" | "signout" }) {
  const paths = {
    details: (
      <>
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5 19.5a7 7 0 0 1 14 0" />
      </>
    ),
    progress: (
      <>
        <path d="M4 18 10 11l4 4 6-8" />
        <path d="M16 7h4v4" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 16.5h.01" />
      </>
    ),
    signout: (
      <>
        <path d="M10 4H5v16h5" />
        <path d="M14 8l4 4-4 4M18 12H9" />
      </>
    ),
  } as const;

  return (
    <span className="flex size-9 items-center justify-center rounded-full bg-cream-deep text-ink/70">
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4.5"
      >
        {paths[name]}
      </svg>
    </span>
  );
}
