import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in — aOS",
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;

  const rawNext = first(params.next) ?? "/piazza";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/piazza";

  const initialError =
    first(params.error) === "link"
      ? "That link has expired or has already been used. Sign in below, or request a new reset link."
      : undefined;

  return (
    <>
      <h1 className="font-display mb-1 text-2xl italic text-navy">Bentornato</h1>
      <p className="mb-6 text-sm text-navy/70">
        Sign in to pick up where you left off.
      </p>

      <LoginForm next={next} initialError={initialError} />

      <p className="mt-5 text-center text-sm text-navy/70">
        <Link
          href="/forgot-password"
          className="underline decoration-orange decoration-2 underline-offset-4 hover:text-navy"
        >
          Forgotten your password?
        </Link>
      </p>

      {/* No signup link, deliberately: membership starts with a conversation and
          a signed contract, and Nina creates the account by hand. */}
      <p className="mt-6 border-t border-navy/10 pt-5 text-center text-xs text-navy/60">
        aOS is invitation only. If you&rsquo;ve joined and haven&rsquo;t received
        your invitation, email{" "}
        <a
          href="mailto:hello@allegrostrategia.com"
          className="underline underline-offset-2"
        >
          hello@allegrostrategia.com
        </a>
        .
      </p>
    </>
  );
}
