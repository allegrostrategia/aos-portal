import Link from "next/link";

/**
 * Cards, and the small pieces of furniture that go on them.
 *
 * L'Editoriale (13 Sep 2026). The recurring surface is a cream panel a shade
 * deeper than the cream ground, generously rounded, with a warm hairline and a
 * soft shadow — not a white panel on a cool ground. Defined once so every
 * screen's cards match rather than each one re-deciding its treatment.
 *
 * Deliberately *not* glass. The reference draws its cards with a blurred,
 * translucent fill, which is the single most expensive thing a mobile browser
 * can be asked to paint on every scroll frame. Over plain cream ground a solid
 * card is indistinguishable from a blurred one, so the blur is reserved for the
 * two surfaces that actually sit over imagery — see `.glass` in globals.css.
 */

export type CardTone = "cream" | "dark" | "orange";

const TONES: Record<CardTone, string> = {
  cream: "border border-ink/8 bg-card text-ink shadow-soft",
  // The hot seat's "next session" card in the reference: near-black, warm.
  dark: "border border-white/10 bg-charcoal text-white shadow-lift",
  // The timer — the one surface the brief says goes orange.
  orange: "border border-orange/40 bg-orange text-white shadow-lift",
};

export function Card({
  as: Tag = "section",
  padded = true,
  tone = "cream",
  className = "",
  children,
}: {
  as?: "section" | "article" | "div" | "li" | "fieldset";
  padded?: boolean;
  tone?: CardTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tag
      className={`rounded-card ${TONES[tone]} ${
        padded ? "p-5 sm:p-6" : ""
      } ${className}`}
    >
      {children}
    </Tag>
  );
}

/**
 * The tracked uppercase label that sits above and below headings — "REFLECT.
 * FOCUS. MAKE IT COUNT." Frequent enough that spelling it out each time is how
 * the tracking and size drift apart.
 *
 * Inter, not the mono, since L'Editoriale. The mono keeps its one job: numbers.
 */
export function Eyebrow({
  children,
  tone = "muted",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "muted" | "accent" | "light";
  className?: string;
}) {
  const tones = {
    muted: "text-ink/55",
    accent: "text-orange",
    light: "text-white/70",
  } as const;

  return (
    <p className={`text-eyebrow font-medium uppercase ${tones[tone]} ${className}`}>
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
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="font-mono text-title text-ink">{value}</p>
      <Eyebrow className="mt-1.5">{label}</Eyebrow>
      {detail ? <p className="mt-1 text-small text-ink/65">{detail}</p> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "gold" | "sky" | "orange";
}) {
  const tones = {
    neutral: "bg-ink/8 text-ink",
    gold: "bg-gold/45 text-ink",
    sky: "bg-sky/35 text-ink",
    orange: "bg-orange/15 text-orange",
  } as const;

  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-eyebrow font-medium uppercase ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * The top of a page.
 *
 * L'Editoriale's header is a large upright serif title with a tracked caption
 * *under* it ("Your log" / REFLECT. FOCUS. MAKE IT COUNT.), rather than an
 * eyebrow above. `eyebrow` is kept for the few pages that still need a label
 * above — a section name a member is inside — but the tagline is the default
 * voice now.
 */
export function PageHeader({
  eyebrow,
  title,
  tagline,
  intro,
  actions,
  size = "display",
}: {
  eyebrow?: string;
  title: React.ReactNode;
  /** Short, tracked, uppercase. Three or four words at most. */
  tagline?: string;
  intro?: React.ReactNode;
  actions?: React.ReactNode;
  size?: "display" | "title";
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <Eyebrow tone="accent" className="mb-3">{eyebrow}</Eyebrow> : null}
        <h1
          className={`font-display font-medium text-ink ${
            size === "display" ? "text-display" : "text-title"
          }`}
        >
          {title}
        </h1>
        {tagline ? <Eyebrow className="mt-3">{tagline}</Eyebrow> : null}
        {intro ? (
          <p className="mt-4 max-w-xl text-body text-ink/70">{intro}</p>
        ) : null}
      </div>
      {actions}
    </header>
  );
}

/**
 * A section heading inside a page — the level below PageHeader. Upright serif,
 * at heading size, with an optional count or action on the right.
 */
export function SectionTitle({
  children,
  aside,
  className = "",
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-4 flex items-baseline justify-between gap-4 ${className}`}>
      <h2 className="font-display text-heading font-medium text-ink">{children}</h2>
      {aside ? <div className="text-small text-ink/60">{aside}</div> : null}
    </div>
  );
}

/**
 * The editorial list row — "01  The Offer Framework  ·  10 min".
 *
 * L'Editoriale's signature list: a two-digit index in the display serif, a
 * title, a quiet line of meta, a chevron. Used for lessons, tools, stations in
 * the list view, archive folders. One component, because the moment three
 * screens each draw their own version the indices stop lining up.
 */
export function NumberedRow({
  index,
  title,
  meta,
  leading,
  trailing,
  href,
  onClick,
  as: Tag = "li",
  className = "",
}: {
  /** 1-based; rendered zero-padded. Omit for rows that aren't a sequence. */
  index?: number;
  title: React.ReactNode;
  meta?: React.ReactNode;
  /** A thumbnail or icon in place of the index. */
  leading?: React.ReactNode;
  /** Something on the right instead of the chevron — a tick, a badge. */
  trailing?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  as?: "li" | "div";
  className?: string;
}) {
  const inner = (
    <>
      {leading ? (
        <span className="shrink-0">{leading}</span>
      ) : index !== undefined ? (
        <span className="font-display w-8 shrink-0 text-heading text-ink/45 tabular-nums">
          {String(index).padStart(2, "0")}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium text-ink">{title}</span>
        {meta ? <span className="mt-0.5 block text-caption text-ink/55">{meta}</span> : null}
      </span>
      {trailing !== undefined ? (
        <span className="shrink-0">{trailing}</span>
      ) : href || onClick ? (
        <Chevron />
      ) : null}
    </>
  );

  const rowClass =
    "flex items-center gap-4 rounded-2xl px-4 py-3.5 transition " +
    (href || onClick ? "hover:bg-cream-deep " : "") +
    className;

  if (href) {
    return (
      <Tag className="list-none">
        <Link href={href} className={rowClass}>
          {inner}
        </Link>
      </Tag>
    );
  }
  if (onClick) {
    return (
      <Tag className="list-none">
        <button type="button" onClick={onClick} className={`w-full text-left ${rowClass}`}>
          {inner}
        </button>
      </Tag>
    );
  }
  return <Tag className={`list-none ${rowClass}`}>{inner}</Tag>;
}

export function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className={`size-4 shrink-0 text-ink/35 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7.5 4.5 13 10l-5.5 5.5" />
    </svg>
  );
}

/**
 * The tab and filter pill — "All / Unread / Peers / Team", "Log / Timer /
 * Insights". A row of these is a `role="tablist"` or a plain list depending on
 * whether they switch content in place; the pill itself doesn't care.
 */
export function Pill({
  active = false,
  className = "",
  children,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-full px-4 py-1.5 text-small font-medium transition ${
        active
          ? "bg-ink text-cream"
          : "bg-cream-deep text-ink/70 hover:text-ink"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** The italic serif pull-quote — the one place italic still lives. */
export function Quote({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={`font-display text-heading text-ink italic ${className}`}>{children}</p>
  );
}
