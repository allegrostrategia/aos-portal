import Link from "next/link";

/**
 * Buttons.
 *
 * Navy carries the primary action, not orange. White on #FF6625 is roughly 3:1,
 * which fails WCAG AA at body size — orange stays the accent, in eyebrows, focus
 * rings and underlines, where it reads without being read *through*.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-navy text-white hover:bg-navy/90",
  secondary: "border border-navy/20 bg-white/70 text-navy hover:border-navy/40",
  ghost: "text-navy/70 hover:text-navy hover:bg-navy/5",
};

const SIZES: Record<ButtonSize, string> = {
  // 16px text on the medium size: anything smaller and iOS Safari zooms the
  // viewport when an adjacent input takes focus.
  md: "px-4 py-2.5 text-body",
  sm: "px-3 py-1.5 text-small",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className = "",
): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: React.ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button {...props} className={buttonClasses(variant, size, className)} />
  );
}

/**
 * Same shape, but navigates. Separate from Button rather than polymorphic —
 * a link and a button differ for keyboard and screen-reader users, and blurring
 * them in the API is how that difference gets lost.
 */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: React.ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return <Link {...props} className={buttonClasses(variant, size, className)} />;
}
