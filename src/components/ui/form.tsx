"use client";

import { useFormStatus } from "react-dom";

import { Button } from "./button";

/**
 * Form controls.
 *
 * Labels are always real `<label>` elements bound to their input — never
 * placeholder text standing in for one, which disappears the moment someone
 * starts typing and is the single most common accessibility failure in forms.
 */

const CONTROL =
  "w-full rounded-md border border-navy/15 bg-white px-3 py-2.5 text-body text-navy " +
  "outline-none transition placeholder:text-navy/40 " +
  "focus:border-orange focus:ring-2 focus:ring-orange/30";

function Wrapper({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-small font-medium text-navy">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-caption text-navy/60">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Field({
  label,
  name,
  hint,
  className = "",
  ...props
}: React.ComponentProps<"input"> & { label: string; name: string; hint?: string }) {
  return (
    <Wrapper label={label} htmlFor={name} hint={hint}>
      <input
        id={name}
        name={name}
        // Text stays at 16px: below that, iOS Safari zooms the viewport when the
        // field takes focus, which reads as the layout breaking.
        className={`${CONTROL} ${className}`}
        aria-describedby={hint ? `${name}-hint` : undefined}
        {...props}
      />
    </Wrapper>
  );
}

export function TextArea({
  label,
  name,
  hint,
  className = "",
  rows = 4,
  ...props
}: React.ComponentProps<"textarea"> & {
  label: string;
  name: string;
  hint?: string;
}) {
  return (
    <Wrapper label={label} htmlFor={name} hint={hint}>
      <textarea
        id={name}
        name={name}
        rows={rows}
        className={`${CONTROL} ${className}`}
        aria-describedby={hint ? `${name}-hint` : undefined}
        {...props}
      />
    </Wrapper>
  );
}

export function Checkbox({
  label,
  name,
  ...props
}: React.ComponentProps<"input"> & { label: string; name: string }) {
  return (
    <label className="flex items-start gap-2.5 py-1 text-small text-navy">
      <input
        type="checkbox"
        id={name}
        name={name}
        className="mt-0.5 size-4 accent-navy"
        {...props}
      />
      {label}
    </label>
  );
}

/**
 * Submits, and reports that it's working. useFormStatus reads the pending state
 * of the enclosing form, so this has to sit inside it rather than take a prop.
 */
export function SubmitButton({
  children,
  full = true,
}: {
  children: React.ReactNode;
  full?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className={full ? "w-full" : ""}>
      {pending ? "One moment…" : children}
    </Button>
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
      // Announced when it appears, so a failed submit isn't silent for anyone
      // not looking at this part of the page.
      role="status"
      aria-live="polite"
      className={
        error
          ? "rounded-md border border-orange/30 bg-blush/25 px-3 py-2 text-small text-navy"
          : "rounded-md border border-sky/40 bg-sky/15 px-3 py-2 text-small text-navy"
      }
    >
      {error ?? notice}
    </p>
  );
}
