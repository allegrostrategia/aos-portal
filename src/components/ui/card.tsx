/**
 * Cards, and the small pieces of furniture that go on them.
 *
 * The recurring surface across aOS: a translucent white panel on the off-white
 * ground, hairline navy border. Defined once so every screen's cards match
 * rather than each one re-deciding its opacity.
 */

export function Card({
  as: Tag = "section",
  padded = true,
  className = "",
  children,
}: {
  as?: "section" | "article" | "div" | "li" | "fieldset";
  padded?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tag
      className={`rounded-xl border border-navy/10 bg-white/60 ${
        padded ? "p-5 sm:p-6" : ""
      } ${className}`}
    >
      {children}
    </Tag>
  );
}

/**
 * The mono uppercase label that sits above headings throughout the product.
 * Frequent enough that spelling it out each time is how the tracking and size
 * drift apart.
 */
export function Eyebrow({
  children,
  tone = "muted",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "muted" | "accent";
  className?: string;
}) {
  return (
    <p
      className={`font-mono text-eyebrow uppercase ${
        tone === "accent" ? "text-orange" : "text-navy/50"
      } ${className}`}
    >
      {children}
    </p>
  );
}

/**
 * A number that means something — hours reclaimed, revenue, a date. JetBrains
 * Mono is reserved for these (brand rule), so routing them through one component
 * keeps that promise without relying on everyone remembering it.
 */
export function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <p className="font-mono mt-2 text-title text-navy">{value}</p>
      {detail ? <p className="mt-1 text-small text-navy/70">{detail}</p> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "gold" | "sky";
}) {
  const tones = {
    neutral: "bg-navy/8 text-navy",
    gold: "bg-gold/40 text-navy",
    sky: "bg-sky/30 text-navy",
  } as const;

  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 font-mono text-eyebrow uppercase ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * The top of a page: eyebrow, title, and an optional line of context.
 */
export function PageHeader({
  eyebrow,
  title,
  intro,
  actions,
}: {
  eyebrow?: string;
  title: string;
  intro?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <Eyebrow tone="accent">{eyebrow}</Eyebrow> : null}
        <h1 className="font-display mt-2 text-title text-navy italic">{title}</h1>
        {intro ? (
          <p className="mt-3 max-w-xl text-small text-navy/70">{intro}</p>
        ) : null}
      </div>
      {actions}
    </header>
  );
}
