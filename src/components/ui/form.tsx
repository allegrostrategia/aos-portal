"use client";

import { useFormStatus } from "react-dom";

import { Button, type ButtonSize, type ButtonVariant } from "./button";

/**
 * Form controls.
 *
 * Labels are always real `<label>` elements bound to their input — never
 * placeholder text standing in for one, which disappears the moment someone
 * starts typing and is the single most common accessibility failure in forms.
 */

// Rounded to match the cards, on the cream-deep ground so a field reads as a
// well in the card rather than a white box stuck on it (L'Editoriale).
const CONTROL =
  "w-full rounded-xl border border-ink/12 bg-cream-deep px-3.5 py-2.5 text-body text-ink " +
  "outline-none transition placeholder:text-ink/40 " +
  "focus:border-orange focus:bg-card focus:ring-2 focus:ring-orange/30";

function Wrapper({
  label,
  htmlFor,
  hint,
  hideLabel,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  /**
   * The label is read out but not drawn.
   *
   * For a column of identical fields — twenty expense categories, each
   * with its name in a box — where a visible label above every one is
   * the same word twenty times and the row beside it already says what
   * the field is. **Never for a field standing on its own**: that is
   * placeholder-as-label, which is the failure this file exists to
   * avoid. The label still exists, still names the row it belongs to,
   * and is still what a screen reader announces.
   */
  hideLabel?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className={hideLabel ? "sr-only" : "text-small font-medium text-ink"}
      >
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-caption text-ink/60">
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
  hideLabel,
  className = "",
  // **The id defaults to the name and is not the same thing.** A screen
  // can carry two fields with one name — two forms, a row of them in a
  // table — and a duplicate id silently points every label at the first
  // one. Found 13 November: three "recurrence" selects on Financials read
  // as one combobox with three names.
  id,
  ...props
}: React.ComponentProps<"input"> & {
  label: string;
  name: string;
  hint?: string;
  hideLabel?: boolean;
}) {
  const controlId = id ?? name;
  return (
    <Wrapper label={label} htmlFor={controlId} hint={hint} hideLabel={hideLabel}>
      <input
        id={controlId}
        name={name}
        // Text stays at 16px: below that, iOS Safari zooms the viewport when the
        // field takes focus, which reads as the layout breaking.
        className={`${CONTROL} ${className}`}
        aria-describedby={hint ? `${controlId}-hint` : undefined}
        {...props}
      />
    </Wrapper>
  );
}

/**
 * A dropdown, wearing the same well as every other field.
 *
 * Added for the sales ledger (12 November), which asks three of these —
 * which row a sale is against, how it is billed, and which offer a row
 * links to. Hand-rolled classes on each one is how a screen ends up with
 * fields that nearly match, so it lives here with the rest.
 */
export function Select({
  label,
  name,
  hint,
  children,
  className = "",
  id,
  ...props
}: React.ComponentProps<"select"> & { label: string; name: string; hint?: string }) {
  const controlId = id ?? name;
  return (
    <Wrapper label={label} htmlFor={controlId} hint={hint}>
      <select
        id={controlId}
        name={name}
        className={`${CONTROL} ${className}`}
        aria-describedby={hint ? `${controlId}-hint` : undefined}
        {...props}
      >
        {children}
      </select>
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
    <label className="flex items-start gap-2.5 py-1 text-small text-ink">
      <input
        type="checkbox"
        id={name}
        name={name}
        className="mt-0.5 size-4 accent-orange"
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
  disabled = false,
  // **Quiet submits exist** (13 November, the expense categories): a
  // list of twenty rows each with its own small action was twenty
  // orange pills down the screen, which is a wall rather than a list.
  // The orange one is still the primary action of a form; this is for
  // the one that belongs to a row.
  variant,
  size,
}: {
  children: React.ReactNode;
  full?: boolean;
  // For work the form is waiting on that `useFormStatus` can't see — a file
  // still uploading, say. Submitting is blocked, not just discouraged.
  disabled?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending || disabled}
      className={full ? "w-full" : ""}
    >
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
          ? "rounded-md border border-orange/30 bg-blush/25 px-3 py-2 text-small text-ink"
          : "rounded-md border border-sky/40 bg-sky/15 px-3 py-2 text-small text-ink"
      }
    >
      {error ?? notice}
    </p>
  );
}
