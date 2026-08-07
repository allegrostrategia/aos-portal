import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Reset your password — aOS",
};

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="font-display mb-1 text-2xl italic text-navy">
        Reset your password
      </h1>
      <p className="mb-6 text-sm text-navy/70">
        We&rsquo;ll email you a link to set a new one.
      </p>

      <ForgotPasswordForm />

      <p className="mt-5 text-center text-sm text-navy/70">
        <Link
          href="/login"
          className="underline decoration-orange decoration-2 underline-offset-4 hover:text-navy"
        >
          Back to sign in
        </Link>
      </p>
    </>
  );
}
