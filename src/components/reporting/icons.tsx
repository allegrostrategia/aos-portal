/**
 * The reporting tool's line icons, and the tinted circle they sit in.
 *
 * Drawn here rather than installed. aOS has no icon library and six
 * hand-drawn icons in `portal-nav.tsx`, in a weight chosen to match the
 * L'Editoriale reference; a library would have put a second, heavier hand
 * next to them on the same screen. These are the same weight and the same
 * 24-unit box, so the two sets read as one.
 *
 * Inline, so they cost no request and server-render into the HTML — which
 * also means a test can assert one is present.
 *
 * Every icon here is decorative: it repeats a label that is already beside
 * it in words. They are all `aria-hidden`, and none of them is the only
 * thing carrying a meaning.
 */

export type ReportIconName =
  // The eleven tabs, in the order the report shows them.
  | "overview"
  | "social"
  | "reels"
  | "email"
  | "funnels"
  | "leads"
  | "ads"
  | "experience"
  | "offers"
  | "financials"
  | "launches"
  // Card and panel marks.
  | "revenue"
  | "profit"
  | "people"
  | "person-plus"
  | "target"
  | "notes"
  | "chart"
  | "heart"
  | "clock"
  | "pointer"
  | "star"
  | "rocket"
  | "calculator"
  | "upload"
  | "share"
  | "eye"
  | "bookmark";

const PATHS: Record<ReportIconName, React.ReactNode> = {
  // A roof over a floor: the report's front page.
  overview: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M10 20v-6h4v6" />
    </>
  ),
  // A shopfront with an awning — the mockup's Social Media mark.
  social: (
    <>
      <path d="M4 9h16l-1 11H5L4 9Z" />
      <path d="M4 9l1.5-4h13L20 9" />
      <path d="M9 9a3 3 0 0 0 6 0" />
    </>
  ),
  // A clapperboard: trial reels.
  reels: (
    <>
      <path d="M3 9h18v10H3V9Z" />
      <path d="M3 9l2.5-4h13L21 9" />
      <path d="M8 5.5 6 9M13 5.5 11 9M18 5.5 16 9" />
    </>
  ),
  email: (
    <>
      <path d="M3 6h18v12H3V6Z" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  funnels: (
    <>
      <path d="M3.5 5h17l-6.5 7.5V20l-4-2.5v-5L3.5 5Z" />
    </>
  ),
  // A rising line with a branch: leads arriving and converting.
  leads: (
    <>
      <path d="M4 19h16" />
      <path d="m5 15 4-4 3 3 6-7" />
      <path d="M14 7h4v4" />
    </>
  ),
  // A megaphone.
  ads: (
    <>
      <path d="M4 10v4h3l7 4V6l-7 4H4Z" />
      <path d="M17.5 9a4 4 0 0 1 0 6" />
    </>
  ),
  // A shield: how the client is looked after.
  experience: (
    <>
      <path d="M12 3.5 19 6v6c0 4-3 7-7 8.5C8 19 5 16 5 12V6l7-2.5Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  // A target with its centre: an offer and what it is aimed at.
  offers: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
    </>
  ),
  // A ledger page.
  financials: (
    <>
      <path d="M5 3.5h14v17H5v-17Z" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 3c3 2 4.5 5 4.5 8l-2 4h-5l-2-4C7.5 8 9 5 12 3Z" />
      <circle cx="12" cy="9.5" r="1.75" />
      <path d="M9.5 17.5 8 21l3-1.5M14.5 17.5 16 21l-3-1.5" />
    </>
  ),
  launches: (
    <>
      <path d="M12 3c3 2 4.5 5 4.5 8l-2 4h-5l-2-4C7.5 8 9 5 12 3Z" />
      <circle cx="12" cy="9.5" r="1.75" />
      <path d="M9.5 17.5 8 21l3-1.5M14.5 17.5 16 21l-3-1.5" />
    </>
  ),

  // A coin stack: money in.
  revenue: (
    <>
      <ellipse cx="12" cy="6.5" rx="6.5" ry="2.5" />
      <path d="M5.5 6.5v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-5" />
      <path d="M5.5 11.5v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-5" />
    </>
  ),
  // A line climbing out of a box: what was kept.
  profit: (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="m7 15 3.5-3.5 3 3L20 8" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8.5" r="3.25" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M15.5 6.2a3.25 3.25 0 0 1 0 6.1" />
      <path d="M16.5 14.2A5.5 5.5 0 0 1 20.5 19" />
    </>
  ),
  "person-plus": (
    <>
      <circle cx="10" cy="8.5" r="3.5" />
      <path d="M4 19a6 6 0 0 1 12 0" />
      <path d="M18 8.5v5M15.5 11h5" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  // A pen: the strategist's note.
  notes: (
    <>
      <path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5 4 20Z" />
      <path d="M14.5 6.5 17.5 9.5" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 17V11M12 17V7M16 17v-4" />
    </>
  ),
  heart: (
    <>
      <path d="M12 19.5C7 16 4 13.2 4 10.1A3.6 3.6 0 0 1 12 7.8 3.6 3.6 0 0 1 20 10.1c0 3.1-3 5.9-8 9.4Z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.2l3.2 2" />
    </>
  ),
  pointer: (
    <>
      <path d="M6 4.5 18.5 11l-5.3 1.5L10.5 18 6 4.5Z" />
    </>
  ),
  star: (
    <>
      <path d="m12 4 2.4 5 5.6.7-4 3.9 1 5.4-5-2.7-5 2.7 1-5.4-4-3.9 5.6-.7L12 4Z" />
    </>
  ),
  calculator: (
    <>
      <path d="M5.5 3.5h13v17h-13v-17Z" />
      <path d="M8.5 7h7v3h-7V7Z" />
      <path d="M9 13.5h.01M12 13.5h.01M15 13.5h.01M9 17h.01M12 17h.01M15 17h.01" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V5" />
      <path d="m8 8.5 4-3.5 4 3.5" />
      <path d="M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15" />
    </>
  ),
  // Views: an eye, as the mockup's Views series is marked.
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  // Saves: a bookmark.
  bookmark: (
    <>
      <path d="M6.5 3.5h11v17L12 16l-5.5 4.5v-17Z" />
    </>
  ),
  share: (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="17.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
      <path d="m8.3 10.8 6.9-3.2M8.3 13.2l6.9 3.2" />
    </>
  ),
};

export function ReportIcon({
  name,
  className = "size-4",
}: {
  name: ReportIconName;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}

/**
 * The tinted disc an icon sits in, on card and panel titles.
 *
 * The mockups give nearly every title one, in a rotation of pale tints. The
 * tints are the brand's pale end at low alpha, so they stay a background and
 * never compete with a chart mark drawn in the same hue at full strength.
 *
 * The icon inside is always ink, never the tint: ink is 14.5:1 on cream and
 * 16.2:1 on white, and a gold icon on a gold disc would be neither legible
 * nor a decision anybody made on purpose.
 */
export type IconTone = "gold" | "blush" | "sky" | "orange" | "lemon";

/**
 * The tints, at the strength the mockups draw them (Dom, 30 October: the
 * first pass was too faint to read as a disc at all).
 *
 * Alpha rather than a solid colour, so each one sits on whichever card it
 * lands on — white on `/reporting`, cream everywhere else — without a
 * second set of values. Every one of them keeps ink above 12:1, which is
 * checked by `scripts/check-icon-circles.mjs`.
 */
const TONE_BG: Record<IconTone, string> = {
  gold: "bg-gold/90",
  blush: "bg-blush/85",
  sky: "bg-sky/85",
  orange: "bg-orange/50",
  lemon: "bg-lemon",
};

/**
 * The rotation, so a row of cards alternates without each one choosing.
 *
 * **Four, not five: lemon is out.** Two reasons, and the second is the one
 * that decided it. Lemon is the palest hue in the brand and tops out at
 * 1.25:1 against a white card even at full strength, so as a disc it barely
 * exists — and lemon is already doing a job on these pages, as the active
 * tab's pill. Spending it on decoration as well would blunt the one place
 * it means something. It stays in `IconTone` for a caller that wants it
 * deliberately; nothing in the rotation reaches for it.
 */
export const ICON_TONES: IconTone[] = ["gold", "blush", "sky", "orange"];

export function toneFor(index: number): IconTone {
  return ICON_TONES[index % ICON_TONES.length];
}

export function IconCircle({
  name,
  tone = "sky",
  size = "md",
}: {
  name: ReportIconName;
  tone?: IconTone;
  /**
   * Both are 40px, which is what the mockups draw and roughly double the
   * first pass. `sm` keeps a slightly smaller glyph inside the same disc,
   * for a KPI card where the disc sits beside a label rather than a
   * heading.
   */
  size?: "sm" | "md";
}) {
  const box = "size-10";
  const icon = size === "sm" ? "size-[18px]" : "size-5";

  return (
    <span
      aria-hidden="true"
      className={`inline-flex ${box} shrink-0 items-center justify-center rounded-full text-ink ${TONE_BG[tone]}`}
    >
      <ReportIcon name={name} className={icon} />
    </span>
  );
}
