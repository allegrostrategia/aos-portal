import Link from "next/link";

/**
 * Buttons.
 *
 * L'Editoriale (13 Sep 2026): pills, and the primary action is orange.
 *
 * That reverses a decision this file used to defend — navy for primary, on the
 * grounds that white on #FF6625 is about 2.9:1 and fails WCAG AA at body size.
 * The number hasn't changed; the direction has, and the redesign brief names
 * "navy buttons" as one of the rules it replaces. The mitigation is weight and
 * size: primary text is semibold at 16px or larger, which is as far as the type
 * can go towards the 3:1 large-text threshold without a darker orange. If the
 * contrast turns out to matter in practice, the one-line alternative is ink
 * text on the orange pill (3.5:1) — see `primary` below. **This is on the list
 * for Dom's eyes before it ships.**
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "dark";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-orange text-white shadow-soft hover:bg-orange/90",
  secondary: "border border-ink/15 bg-card text-ink hover:border-ink/30",
  ghost: "text-ink/70 hover:bg-cream-deep hover:text-ink",
  // On the dark card the primary is still orange; this is the quiet one there.
  dark: "border border-white/20 bg-white/10 text-white hover:bg-white/15",
};

const SIZES: Record<ButtonSize, string> = {
  // 16px text on the medium size: anything smaller and iOS Safari zooms the
  // viewport when an adjacent input takes focus.
  lg: "px-7 py-3.5 text-body",
  md: "px-5 py-2.5 text-body",
  sm: "px-3.5 py-1.5 text-small",
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
