"use client";

import { useFormStatus } from "react-dom";

/**
 * The small set of form pieces the auth screens need. Not the component library —
 * that's Step 2, and it should be designed against real screens rather than
 * extrapolated from a login box.
 */

export function Field({
  label,
  name,
  type = "text",
  autoComplete,
  required = true,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  defaultValue?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-navy">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        defaultValue={defaultValue}
        // 16px minimum on mobile, or iOS Safari zooms the viewport on focus.
        className="w-full rounded-md border border-navy/15 bg-white px-3 py-2.5 text-base text-navy
                   outline-none transition placeholder:text-navy/40
                   focus:border-orange focus:ring-2 focus:ring-orange/30"
      />
      {hint ? <p className="text-xs text-navy/60">{hint}</p> : null}
    </div>
  );
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      // Navy rather than orange: white on #FF6625 is about 3:1, which fails AA for
      // body-sized text. Orange stays the accent, navy carries the action.
      className="w-full rounded-md bg-navy px-4 py-2.5 text-base font-medium text-white
                 transition hover:bg-navy/90 focus-visible:outline-2 focus-visible:outline-offset-2
                 focus-visible:outline-orange disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "One moment…" : children}
    </button>
  );
}

export function FormMessage({
  error,
  notice,
}: {
  error?: string;
  notice?: string;
}) {
  if (!error && !notice) return null;

  return (
    <p
      // Announced to screen readers when it appears, so a failed sign-in isn't
      // silent for anyone not looking at that part of the page.
      role="status"
      aria-live="polite"
      className={
        error
          ? "rounded-md border border-orange/30 bg-blush/25 px-3 py-2 text-sm text-navy"
          : "rounded-md border border-sky/40 bg-sky/15 px-3 py-2 text-sm text-navy"
      }
    >
      {error ?? notice}
    </p>
  );
}
