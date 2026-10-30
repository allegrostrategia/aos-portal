import Link from "next/link";

import { Badge, Eyebrow } from "@/components/ui/card";
import { signOut } from "@/lib/auth/actions";
import { SHIPPED_CATEGORIES, type CategoryKey } from "@/lib/reporting/categories";
import { ReportIcon, type ReportIconName } from "./icons";
import type { SectionState } from "@/lib/reporting/completion";
import { reportHref, type ReportContext } from "@/lib/reporting/context";
import { monthLabel } from "@/lib/reporting/months";
import { SectionPicker } from "./section-picker";

/**
 * The frame every reporting screen sits in.
 *
 * Built to the approved mockups' layout with the one change §3 asks for — no
 * left sidebar, a horizontal tab row under the page header, so it doesn't
 * clash with the aOS menu. Rendered in the current brand rather than the
 * mockups' pale blue-white, on Nina's call of 30 September: keep the layout,
 * change the surfaces.
 *
 * No client JavaScript. The month picker is a `<details>` and everything else
 * is a link, which is how the rest of this codebase does navigation — it works
 * before hydration and there is nothing to load.
 */

export function ReportShell({
  ctx,
  active,
  path,
  title,
  tagline,
  actions,
  progress,
  sectionStatus,
  children,
}: {
  ctx: ReportContext;
  /** Which tab is lit. */
  /** The section whose tab is lit, or null on a page that is not one —
   *  the settings screen.  already falls back to "Report". */
  active: CategoryKey | null;
  /**
   * The route this screen is on, so the month and business pickers keep you
   * where you are instead of bouncing you to the Overview. Passed in rather
   * than read from a router hook, which would make the whole shell a client
   * component to learn something the page already knows.
   */
  path: string;
  title: string;
  tagline?: string;
  actions?: React.ReactNode;
  /**
   * The mockups' "6 of 10 sections complete" bar, on the entry screens.
   *
   * Only where it is true: the report itself is not something a reader
   * completes, and a progress bar over somebody else's finished report
   * would be measuring the wrong person's work.
   */
  progress?: { done: number; total: number };
  /**
   * Per-tab completion, on the entry screens (brief §3): a tick for done,
   * a dot for started, an empty ring for nothing yet.
   *
   * Every marker carries a word in its `title` and in the visually hidden
   * text beside it, so the three states are never three colours alone.
   */
  sectionStatus?: Partial<Record<CategoryKey, SectionState>>;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="border-b border-ink/8 bg-cream">
        <div className="mx-auto w-full max-w-6xl px-4 pt-8 pb-0 sm:px-6 sm:pt-10">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
            <div className="min-w-0">
              <Eyebrow>{ctx.workspace.business_name}</Eyebrow>
              <h1 className="font-display mt-2 text-display font-medium text-ink">
                {title}
              </h1>
              {tagline ? <Eyebrow className="mt-2">{tagline}</Eyebrow> : null}
            </div>

            <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:gap-3">
              {ctx.showWorkspacePicker ? <WorkspacePicker ctx={ctx} /> : null}
              <MonthPicker ctx={ctx} path={path} />
              {actions}
              <SignOut />
            </div>
          </div>

          {progress ? <SectionProgress {...progress} /> : null}

          <TabRow ctx={ctx} active={active} sectionStatus={sectionStatus} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </>
  );
}

/**
 * "6 of 10 sections complete", with the mockups' gold bar.
 *
 * The sentence is the measurement and the bar repeats it, not the other way
 * round: a bar alone would leave somebody counting pixels to find out how
 * much is left, and it is the one number on this screen that answers "am I
 * nearly done".
 */
function SectionProgress({ done, total }: { done: number; total: number }) {
  const share = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div
        className="h-2.5 w-full max-w-xs overflow-hidden rounded-full sm:w-56"
        style={{ background: "var(--aos-cream-deep)" }}
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${done} of ${total} sections complete`}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${share}%`,
            background: "var(--aos-gold)",
            boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--aos-ink) 14%, transparent)",
          }}
        />
      </div>
      <p className="text-small text-ink/65">
        {done} of {total} sections complete
      </p>
    </div>
  );
}

/**
 * The tick, dot or ring beside a tab on the entry screens.
 *
 * Three shapes as well as three colours, and a word in the tooltip and in
 * the hidden text — so it survives being read in greyscale, by somebody who
 * cannot separate green from orange, and out loud.
 */
function SectionMarker({ state }: { state: SectionState }) {
  const label =
    state === "done" ? "complete" : state === "started" ? "in progress" : "not started";

  return (
    <>
      <span aria-hidden="true" title={label} className="shrink-0">
        {state === "done" ? (
          <svg viewBox="0 0 16 16" className="size-4" fill="none">
            <circle cx="8" cy="8" r="7" fill="#1f7a4d" />
            <path
              d="m5 8.2 2.1 2.1L11 6.4"
              stroke="#fff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : state === "started" ? (
          <svg viewBox="0 0 16 16" className="size-4">
            <circle cx="8" cy="8" r="5" fill="var(--aos-orange)" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="size-4" fill="none">
            <circle
              cx="8"
              cy="8"
              r="5.5"
              stroke="color-mix(in oklab, var(--aos-ink) 28%, transparent)"
              strokeWidth="1.5"
            />
          </svg>
        )}
      </span>
      <span className="sr-only"> — {label}</span>
    </>
  );
}

/**
 * The way out.
 *
 * A reporting login has nowhere else to sign out from: /you and /no-access
 * both live behind requireMember(), and a retainer client has no members
 * row. Until 2 October the only way out was to type /no-access from memory,
 * which Dom had to do. So it belongs in this shell, which is the only
 * furniture every reporting login shares.
 *
 * A form rather than a link, because signing out is a change and a GET that
 * changes something is a GET a browser may make on its own.
 */
function SignOut() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="rounded-full px-3 py-2 text-small font-medium text-ink/60 underline underline-offset-4 transition hover:text-ink"
      >
        Sign out
      </button>
    </form>
  );
}

/**
 * The tab row. Scrolls sideways on a phone rather than wrapping (§3), with the
 * scrollbar hidden — a row of category names that reflows to three lines is
 * not the same navigation.
 *
 * Only categories with a page behind them appear. §13: every tab has exactly
 * one route in, so a tab for something unbuilt is not drawn at all rather than
 * drawn and disabled.
 */
function TabRow({
  ctx,
  active,
  sectionStatus,
}: {
  ctx: ReportContext;
  active: CategoryKey | null;
  sectionStatus?: Partial<Record<CategoryKey, SectionState>>;
}) {
  const visible = SHIPPED_CATEGORIES.filter(
    (c) => !ctx.workspace.hidden_categories.includes(c.key),
  );

  const hrefFor = (category: (typeof visible)[number]) =>
    category.key === "overview"
      ? reportHref("/reporting", ctx)
      : reportHref(`/reporting/${category.slug}`, ctx);

  const sections = visible.map((category) => ({
    label: category.label,
    href: hrefFor(category),
  }));
  const currentHref = (() => {
    const found = visible.find((c) => c.key === active);
    return found ? hrefFor(found) : (sections[0]?.href ?? "");
  })();

  return (
    <>
      {/* Below `sm`, one control saying where you are. Eleven tabs in a
          sideways scroller left the current one off the screen — measured
          at 390px, and nothing would scroll it there. */}
      <SectionPicker
        sections={sections}
        currentLabel={visible.find((c) => c.key === active)?.label ?? "Report"}
        currentHref={currentHref}
      />

      <nav
        aria-label="Report sections"
        data-tabs
        // Tabs from `sm` up, where there is room for two lines. Eleven do
        // not fit on one at 1440, and the eleventh sat half outside the
        // old scroller, so landing on Launches showed a bar with no lit
        // tab on it. Measured at production stage: six tabs, one line.
        className="mt-6 hidden sm:block"
      >
        <ul className="flex w-full flex-wrap gap-1 pb-px">
          {visible.map((category) => {
            const isActive = category.key === active;

            return (
              <li key={category.key}>
                <Link
                  href={hrefFor(category)}
                  aria-current={isActive ? "page" : undefined}
                  // The mockups' active tab: a lemon pill, not an underline.
                  // It carries its own background, so `aria-current` is not
                  // the only thing saying where you are — and the label stays
                  // ink on lemon, which is 12.6:1.
                  className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2.5 text-small font-medium whitespace-nowrap transition ${
                    isActive
                      ? "bg-lemon text-ink"
                      : "text-ink/55 hover:bg-ink/5 hover:text-ink"
                  }`}
                >
                  {/* **The icon in ink on every tab, not in the label's
                      grey** (Dom, 30 October). The label of an inactive tab
                      is ink/55 because it is secondary text; the icon is a
                      shape rather than text, and at 18px a shape at 55%
                      reads as switched off rather than as not-current. The
                      mockups draw all eleven in full colour and let the
                      lemon pill alone say which one you are on. */}
                  <ReportIcon
                    name={CATEGORY_ICONS[category.key]}
                    className="size-[18px] shrink-0 text-ink"
                  />
                  {category.label}
                  {sectionStatus?.[category.key] ? (
                    <SectionMarker state={sectionStatus[category.key]!} />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

/**
 * One icon per category, as the mockups draw them.
 *
 * Exported because the category pages put the same mark on their headline
 * cards — the Offers page's four cards all carry the Offers glyph. One map,
 * so a category cannot end up with one icon on its tab and another on its
 * cards.
 *
 * Keyed by `CategoryKey` and exhaustive, so adding a category to
 * `categories.ts` without choosing its icon is a type error rather than a
 * tab that silently renders nothing.
 *
 * Decorative in the strict sense: every tab still has its label beside the
 * icon at every width, and the icons are `aria-hidden`.
 */
export const CATEGORY_ICONS: Record<CategoryKey, ReportIconName> = {
  overview: "overview",
  social_media: "social",
  trial_reels: "reels",
  email: "email",
  funnels: "funnels",
  leads_conversions: "leads",
  ads: "ads",
  client_experience: "experience",
  offers: "offers",
  financials: "financials",
  launches: "launches",
};

/**
 * The month dropdown from the mockups, as a `<details>`.
 *
 * The previous and next arrows sit beside it because paging one month at a
 * time is what people actually do, and a dropdown of eighteen months is a poor
 * way to move by one.
 */
function MonthPicker({ ctx, path }: { ctx: ReportContext; path: string }) {
  // Hidden on a phone: the two chevrons cost about 72px next to a 150px
  // month pill and a business pill, and the dropdown already moves by one.
  // A choice about a small screen, not a fix for an overflow — measured at
  // 390px, the page does not overflow either way.
  const arrow =
    "hidden size-9 shrink-0 items-center justify-center rounded-full text-ink transition hover:bg-cream-deep sm:flex";

  return (
    <div className="flex items-center gap-1">
      {ctx.month.previous ? (
        <Link
          href={reportHref(path, ctx, { month: ctx.month.previous })}
          aria-label={`The month before, ${monthLabel(ctx.month.previous)}`}
          className={arrow}
        >
          <Arrow direction="left" />
        </Link>
      ) : (
        <span className={`${arrow} opacity-25`} aria-hidden>
          <Arrow direction="left" />
        </span>
      )}

      <details className="group relative">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-ink/15 bg-card px-4 py-2 text-small font-medium text-ink">
          <span className="font-mono">{ctx.month.label}</span>
          <Arrow direction="down" className="size-3.5 opacity-60" />
        </summary>
        <ul className="absolute right-0 z-20 mt-2 max-h-72 w-52 overflow-y-auto rounded-2xl border border-ink/10 bg-card p-1.5 shadow-lift">
          {ctx.month.options.map((option) => (
            <li key={option.month}>
              <Link
                href={reportHref(path, ctx, { month: option.month })}
                aria-current={option.month === ctx.month.month ? "true" : undefined}
                className={`block rounded-xl px-3 py-2 font-mono text-small transition hover:bg-cream-deep ${
                  option.month === ctx.month.month ? "text-ink" : "text-ink/70"
                }`}
              >
                {option.label}
              </Link>
            </li>
          ))}
        </ul>
      </details>

      {ctx.month.next ? (
        <Link
          href={reportHref(path, ctx, { month: ctx.month.next })}
          aria-label={`The month after, ${monthLabel(ctx.month.next)}`}
          className={arrow}
        >
          <Arrow direction="right" />
        </Link>
      ) : (
        <span className={`${arrow} opacity-25`} aria-hidden>
          <Arrow direction="right" />
        </span>
      )}
    </div>
  );
}

/**
 * Which business. Only drawn when there is more than one to choose between.
 *
 * The list is whatever RLS returned, so it is already only what this login is
 * entitled to — a retainer client's own, Elize's assigned clients, or every
 * client for Nina. §13's rule that a client must never see a switcher holds
 * because a client with one business never reaches this code, and one with two
 * sees only their own two.
 */
function WorkspacePicker({ ctx }: { ctx: ReportContext }) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-ink/15 bg-card px-4 py-2 text-small font-medium text-ink">
        <span className="max-w-32 truncate sm:max-w-40">{ctx.workspace.business_name}</span>
        <Arrow direction="down" className="size-3.5 opacity-60" />
      </summary>
      <ul className="absolute right-0 z-20 mt-2 max-h-72 w-60 overflow-y-auto rounded-2xl border border-ink/10 bg-card p-1.5 shadow-lift">
        {ctx.choices.map((choice) => (
          <li key={choice.id}>
            <Link
              href={reportHref("/reporting", ctx, { workspace: choice.id })}
              aria-current={choice.id === ctx.workspace.id ? "true" : undefined}
              className={`block truncate rounded-xl px-3 py-2 text-small transition hover:bg-cream-deep ${
                choice.id === ctx.workspace.id ? "text-ink" : "text-ink/70"
              }`}
            >
              {choice.business_name}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Draft or Published, for a retainer month.
 *
 * Not drawn at all for a self-serve workspace: §8 says those "have no draft
 * state; they're always visible", so a badge saying so would be noise about a
 * distinction that does not exist for them.
 */
export function PublishBadge({
  kind,
  publishedAt,
  show = true,
}: {
  kind: "retainer" | "aos_member" | "chiarezza";
  publishedAt: string | null;
  /**
   * Draft/Published is the team's working state. A client is never shown
   * it — an orange DRAFT label on their own report says nothing they can
   * act on and plenty they shouldn't have to think about. Removed from the
   * markup rather than hidden (§13).
   */
  show?: boolean;
}) {
  if (!show) return null;
  if (kind !== "retainer") return null;
  return publishedAt ? (
    <Badge tone="sky">Published</Badge>
  ) : (
    <Badge tone="orange">Draft</Badge>
  );
}

function Arrow({
  direction,
  className = "",
}: {
  direction: "left" | "right" | "down";
  className?: string;
}) {
  const paths = {
    left: "M12.5 4.5 7 10l5.5 5.5",
    right: "M7.5 4.5 13 10l-5.5 5.5",
    down: "M4.5 7.5 10 13l5.5-5.5",
  };
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className={`size-4 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[direction]} />
    </svg>
  );
}
