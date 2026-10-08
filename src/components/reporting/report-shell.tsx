import Link from "next/link";

import { Badge, Eyebrow } from "@/components/ui/card";
import { signOut } from "@/lib/auth/actions";
import { SHIPPED_CATEGORIES, type CategoryKey } from "@/lib/reporting/categories";
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
  children,
}: {
  ctx: ReportContext;
  /** Which tab is lit. */
  active: CategoryKey;
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

          <TabRow ctx={ctx} active={active} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
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
function TabRow({ ctx, active }: { ctx: ReportContext; active: CategoryKey }) {
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
                  className={`inline-block rounded-t-xl border-b-2 px-4 py-3 text-small font-medium whitespace-nowrap transition ${
                    isActive
                      ? "border-orange text-ink"
                      : "border-transparent text-ink/55 hover:text-ink"
                  }`}
                >
                  {category.label}
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
