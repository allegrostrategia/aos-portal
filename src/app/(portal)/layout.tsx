import Link from "next/link";

import { requireMember } from "@/lib/auth/member";
import { signOut } from "@/lib/auth/actions";

/**
 * The authenticated shell. Every member-facing screen sits inside this, so the
 * real access decision happens once, here — the proxy's check is optimistic
 * (cookie only, no database round trip on every prefetch), which makes it a
 * filter rather than the gate.
 *
 * The full navigation — sidebar to Piazza, La Strada, the stations — arrives with
 * the design system in Step 2. This is the minimum that proves auth works and
 * gives somebody a way back out.
 */
export default async function PortalLayout({ children }: LayoutProps<"/">) {
  const member = await requireMember();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-navy/10 bg-white/60">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-3">
          <p className="font-display text-xl italic text-navy">aOS</p>

          <div className="flex items-center gap-4">
            {member.role === "admin" ? (
              <Link
                href="/admin/members"
                className="text-sm text-navy/70 underline underline-offset-4 transition hover:text-navy"
              >
                Admin
              </Link>
            ) : null}
            <span className="hidden text-sm text-navy/70 sm:inline">
              {member.full_name}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm text-navy/70 underline underline-offset-4 transition hover:text-navy"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
