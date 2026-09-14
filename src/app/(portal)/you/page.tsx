import type { Metadata } from "next";

import { getCurrentMember } from "@/lib/auth/member";
import { saveNotificationPreferences, signOut } from "@/lib/auth/actions";
import { getHeadshotUrls } from "@/lib/directory/queries";
import { formatCalendarDate } from "@/lib/time-zone";
import { Avatar } from "@/components/avatar";
import { Card, Eyebrow, NumberedRow, Quote } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PushToggle } from "@/components/push/push-toggle";

export const metadata: Metadata = { title: "You · aOS" };

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
 * Notifications: three switches, one per kind of email the product sends.
 * Each is honoured by the sender itself (runner.ts), not by the page — a
 * switch that only changed a row would be a lie.
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
            meta="Name, headshot and what you do. What other members see"
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

      <Card className="mb-6">
        <Eyebrow>Notifications</Eyebrow>
        <p className="mt-1 text-small text-ink/65">
          Which emails you want. Everything inside aOS still works the same.
        </p>
        <form action={saveNotificationPreferences} className="mt-4 flex flex-col gap-3">
          <p className="text-eyebrow font-medium text-ink/45 uppercase">By email</p>
          {[
            ["notify_reminders", "Reminders", "The weekly log, the hot seat, and check-ins on your builds.", member.notify_reminders],
            ["notify_chat", "Chat", "A note when something's waited unread in Sociale for an hour.", member.notify_chat],
            ["notify_pairing", "Pairing", "Who you're paired with each month, and when you're both free.", member.notify_pairing],
          ].map(([name, label, hint, on]) => (
            <label key={String(name)} className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name={String(name)}
                defaultChecked={Boolean(on)}
                className="mt-1 size-4 accent-orange"
              />
              <span>
                <span className="block text-body font-medium text-ink">{label}</span>
                <span className="block text-caption text-ink/55">{hint}</span>
              </span>
            </label>
          ))}
          <p className="mt-2 text-eyebrow font-medium text-ink/45 uppercase">On your phone</p>
          {[
            ["push_chat", "Messages", "A notification when somebody messages you in Sociale.", member.push_chat],
            ["push_reactions", "Reactions", "When somebody reacts to one of your messages. Off unless you want it.", member.push_reactions],
          ].map(([name, label, hint, on]) => (
            <label key={String(name)} className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name={String(name)}
                defaultChecked={Boolean(on)}
                className="mt-1 size-4 accent-orange"
              />
              <span>
                <span className="block text-body font-medium text-ink">{label}</span>
                <span className="block text-caption text-ink/55">{hint}</span>
              </span>
            </label>
          ))}
          <Button type="submit" size="sm" variant="secondary" className="mt-1 self-start">
            Save
          </Button>
        </form>

        <div className="mt-5 border-t border-ink/8 pt-5">
          <PushToggle />
        </div>
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

      <Quote className="text-ink/70">Time reclaimed, not time off.</Quote>
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
