import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { getCurrentMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRoadmap, getStradaState, getTrainingOptions, isDone } from "@/lib/roadmap/queries";
import { buildCalendar, monthName, positionOn, weekLabel, weekRange, ROADMAP_MONTHS, type RoadmapWeek } from "@/lib/roadmap/calendar";
import { actionsByWeek, type RoadmapMonth } from "@/lib/roadmap/shape";
import { BUCKET_ORDER, BUCKET_PILL } from "@/lib/roadmap/buckets";
import { startRoadmap } from "@/lib/roadmap/strada-actions";
import { firstMondayOfNextMonth } from "@/lib/onboarding/cadence";
import { utcToWallClock } from "@/lib/time-zone";
import { Card } from "@/components/ui/card";
import { ActionRow, AddAction, type ActionView } from "./action-row";
import { ItineraryNote, MonthTitle, PublishForm, StartsOnForm } from "./edit-forms";

export const metadata: Metadata = { title: "La Strada · aOS" };

/**
 * La Strada: the member's six-month plan (docs/aOS_LaStrada_Roadmap_Brief.md,
 * built from docs/aOS_Roadmap_Mockup.html).
 *
 * One page, two views. A member sees their plan; Nina, with the toggle on
 * Edit, edits it here, on the same page. The old admin editor is gone.
 *
 * Month = a calendar month from `starts_on`; week cards are that month's
 * Monday-weeks, four or five of them (lib/roadmap/calendar). Actions land
 * in cards by their existing `week` field. Done is a tick on the action
 * (lib/roadmap/queries: isDone). Months beyond what Nina has filled in show
 * as "set at your Month 3 call".
 */
export default async function RoadmapPage({ searchParams }: PageProps<"/roadmap">) {
  const me = (await getCurrentMember())!;
  const params = await searchParams;
  const isAdmin = me.role === "admin";

  // An admin looks at a member's plan and may edit it. Everyone else: their own.
  const wantedMember = isAdmin && typeof params.member === "string" ? params.member : null;
  const editing = isAdmin && params.edit === "1";
  const supabase = await createClient();

  const members = isAdmin
    ? (((await supabase.from("members").select("id, full_name, status").eq("role", "member").order("full_name")).data ?? []) as {
        id: string; full_name: string; status: string;
      }[])
    : [];
  const subject = wantedMember
    ? (members.find((m) => m.id === wantedMember) ?? null)
    : isAdmin
      ? null
      : { id: me.id, full_name: me.full_name, status: me.status };

  const firstName = subject?.full_name.split(" ")[0] ?? "";
  const today = utcToWallClock(new Date()).slice(0, 10);
  const roadmap = subject ? await getCurrentRoadmap(subject.id) : null;
  // A draft is Nina's until she publishes it. The member sees no roadmap.
  const visible = roadmap && (roadmap.confirmedAt || editing);
  const [state, trainings] = await Promise.all([
    roadmap && subject ? getStradaState(roadmap.id, subject.id) : Promise.resolve(null),
    editing || roadmap ? getTrainingOptions() : Promise.resolve([]),
  ]);
  const trainingById = new Map(trainings.map((t) => [t.id, t]));

  const startsOn = roadmap?.startsOn ?? (roadmap?.confirmedAt ? firstMondayOfNextMonth(roadmap.confirmedAt.slice(0, 10)) : null);
  const calendar = startsOn ? buildCalendar(startsOn) : null;
  const position = calendar ? positionOn(calendar, today) : null;
  const currentWeekIndex = position?.kind === "during" ? position.week.index : position?.kind === "after" ? Infinity : 0;

  const monthsByNumber = new Map((roadmap?.months ?? []).map((m) => [m.month, m]));
  const populated = [...monthsByNumber.keys()].filter((n) => (monthsByNumber.get(n)?.focuses.some((f) => f.actions.length > 0) || monthsByNumber.get(n)?.title));
  const lastPopulated = populated.length ? Math.max(...populated) : 0;

  const allActions = (roadmap?.months ?? []).flatMap((m) => m.focuses.flatMap((f) => f.actions));
  const doneCount = state ? allActions.filter((a) => isDone(a.id, state)).length : 0;
  const pct = allActions.length ? Math.round((doneCount / allActions.length) * 100) : 0;

  const toView = (a: RoadmapMonth["focuses"][number]["actions"][number]): ActionView => {
    const training = a.trainingId ? trainingById.get(a.trainingId) : null;
    return {
      id: a.id,
      label: a.label,
      bucket: a.bucket ?? training?.bucket ?? null,
      week: a.week,
      trainingId: a.trainingId,
      training: training ? { title: training.title, stationName: training.stationName, stationSlug: training.stationSlug } : null,
      done: state ? isDone(a.id, state) : false,
    };
  };

  const editHref = (on: boolean) => `/roadmap?${on ? "edit=1" : "edit=0"}${subject && isAdmin ? `&member=${subject.id}` : ""}`;

  return (
    <main className="-mx-5 flex-1 pb-8 sm:-mx-0">
      {/* ===== Hero: the photo under navy at 55%, the mockup's layout on top. */}
      <section className="relative overflow-hidden text-white sm:rounded-card">
        <Image
          src="/illustrations/roadmap-hero.jpg"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 60rem, 100vw"
          className="object-cover"
        />
        <div aria-hidden className="absolute inset-0 bg-navy/55" />
        <div className="relative mx-auto max-w-[900px] px-5 pt-10 pb-9 sm:px-6 sm:pt-12">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-1.5 text-eyebrow tracking-wide text-sky uppercase">La Strada · Your Roadmap</p>
              <h1 className="font-display max-w-[20ch] text-[clamp(1.7rem,5vw,2.6rem)] leading-tight font-medium">
                {subject ? (
                  <>{firstName}&rsquo;s <em className="font-normal italic">six-month</em> plan</>
                ) : (
                  <>Whose plan?</>
                )}
              </h1>
            </div>

            {isAdmin && subject ? (
              <nav aria-label="View" className="flex shrink-0 rounded-full border border-white/25 bg-white/10 p-1 text-caption">
                <Link href={editHref(false)} aria-current={!editing ? "page" : undefined} className={`rounded-full px-3.5 py-1.5 font-medium ${!editing ? "bg-orange text-ink" : "text-white"}`}>
                  Member view
                </Link>
                <Link href={editHref(true)} aria-current={editing ? "page" : undefined} className={`rounded-full px-3.5 py-1.5 font-medium ${editing ? "bg-orange text-ink" : "text-white"}`}>
                  Edit (Nina)
                </Link>
              </nav>
            ) : null}
          </div>

          {isAdmin ? (
            <form method="get" className="mb-5 flex flex-wrap items-center gap-2 text-caption text-white/80">
              {editing ? <input type="hidden" name="edit" value="1" /> : null}
              <label htmlFor="member">Member</label>
              <select id="member" name="member" defaultValue={subject?.id ?? ""} className="rounded-md border border-white/30 bg-white/10 px-2 py-1 text-caption text-white">
                <option value="" className="text-ink">Choose</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id} className="text-ink">{m.full_name}{m.status !== "active" ? ` (${m.status})` : ""}</option>
                ))}
              </select>
              <button type="submit" className="rounded-full border border-white/40 px-2.5 py-1 font-medium text-white hover:bg-white/10">Open</button>
            </form>
          ) : null}

          {visible && calendar && position ? (
            <div>
              <div className="mb-2 flex justify-between text-small text-sky">
                <span>{weekLabel(position, calendar.totalWeeks)}</span>
                <span>{pct}% complete</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-orange" style={{ width: `${pct}%` }} />
              </div>
              {editing && roadmap ? (
                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                  <StartsOnForm roadmapId={roadmap.id} startsOn={calendar.startsOn} />
                  {!roadmap.confirmedAt ? <PublishForm roadmapId={roadmap.id} memberName={firstName} /> : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {/* ===== Nothing to show: the member's before-the-1:1 state, or Nina's start button. */}
      {!subject ? (
        <div className="mx-auto max-w-[900px] px-5 pt-6 sm:px-0">
          <Card><p className="text-small text-ink/70">Pick a member above to see, or edit, their plan.</p></Card>
        </div>
      ) : !visible ? (
        <div className="mx-auto max-w-[900px] px-5 pt-6 sm:px-0">
          <Card>
            {editing ? (
              <div className="flex flex-col gap-3">
                <p className="text-small text-ink/80">
                  {roadmap ? "This is a draft. " : `${firstName} has no roadmap yet. `}
                  Start it here, fill in month 1, and publish when it&rsquo;s ready. Nothing shows for {firstName} until then.
                </p>
                {!roadmap ? (
                  <form action={startRoadmap}>
                    <input type="hidden" name="member_id" value={subject.id} />
                    <button type="submit" className="rounded-full bg-orange px-4 py-1.5 text-small font-semibold text-ink">
                      Start {firstName}&rsquo;s roadmap
                    </button>
                  </form>
                ) : null}
              </div>
            ) : (
              <>
                <p className="font-display text-heading font-medium text-ink">Your roadmap arrives at your 1:1</p>
                <p className="mt-2 text-small text-ink/70">
                  Nina builds it from your onboarding form and your first weeks of tracked time, and walks you
                  through it on the call. It appears here the moment she publishes it: six months, week by week.
                </p>
              </>
            )}
          </Card>
        </div>
      ) : (
        <StradaBody
          roadmapId={roadmap!.id}
          months={monthsByNumber}
          calendar={calendar!}
          currentWeekIndex={currentWeekIndex}
          lastPopulated={lastPopulated}
          editing={editing}
          memberFirstName={firstName}
          isOwner={subject.id === me.id}
          notes={state?.notes ?? new Map()}
          trainings={trainings}
          toView={toView}
          isDraft={!roadmap!.confirmedAt}
        />
      )}
    </main>
  );
}

function StradaBody({
  roadmapId, months, calendar, currentWeekIndex, lastPopulated, editing, memberFirstName, isOwner, notes, trainings, toView, isDraft,
}: {
  roadmapId: string;
  months: Map<number, RoadmapMonth>;
  calendar: ReturnType<typeof buildCalendar>;
  currentWeekIndex: number;
  lastPopulated: number;
  editing: boolean;
  memberFirstName: string;
  isOwner: boolean;
  notes: Map<number, string>;
  trainings: Awaited<ReturnType<typeof getTrainingOptions>>;
  toView: (a: RoadmapMonth["focuses"][number]["actions"][number]) => ActionView;
  isDraft: boolean;
}) {
  const currentMonth = calendar.weeks.find((w) => w.index === currentWeekIndex)?.month ?? (currentWeekIndex === Infinity ? ROADMAP_MONTHS + 1 : 0);
  // Months Nina has filled in, plus, in edit mode, the next empty one so she can.
  const shown = editing ? Math.min(ROADMAP_MONTHS, Math.max(lastPopulated, 1) + (lastPopulated < ROADMAP_MONTHS ? 1 : 0)) : Math.max(lastPopulated, 1);

  return (
    <>
      {/* Month strip: the jump nav, overlapping the hero's foot as in the mockup. */}
      <div className="relative z-10 mx-auto -mt-6 max-w-[900px] px-5 sm:px-6">
        <nav aria-label="Months" className="flex gap-1 overflow-x-auto rounded-2xl bg-card px-2.5 py-3.5 shadow-lift">
          {calendar.months.map((m) => {
            const done = m.month < currentMonth;
            const current = m.month === currentMonth;
            const locked = m.month > shown;
            return (
              <a
                key={m.month}
                href={`#month-${locked ? shown + 1 : m.month}`}
                aria-current={current ? "step" : undefined}
                className={`block min-w-[84px] flex-1 rounded-[10px] px-1 py-2 text-center text-small font-medium text-ink transition ${
                  current ? "bg-cream-deep opacity-100" : done ? "opacity-100" : "opacity-55 hover:opacity-80"
                }`}
              >
                <span
                  aria-hidden
                  className={`mx-auto mb-1.5 block size-[9px] rounded-full ${
                    done || current ? "bg-orange" : "bg-ink/30"
                  } ${current ? "ring-4 ring-orange/20" : ""}`}
                />
                Month {m.month}
              </a>
            );
          })}
        </nav>
      </div>

      <div className="mx-auto max-w-[900px] px-5 pt-8 sm:px-6">
        {editing ? (
          <p className="mb-4 rounded-[10px] bg-gold px-3 py-2 text-center text-small font-semibold text-ink">
            You&rsquo;re editing {memberFirstName}&rsquo;s roadmap. Changes save instantly, no rebuild needed.
            {isDraft ? " Still a draft: publish from the hero when it's ready." : ""}
          </p>
        ) : null}

        {/* Legend: The Map's bucket colours. */}
        <div className="mb-5 flex flex-wrap gap-x-4 gap-y-2 rounded-xl bg-card px-4 py-3 shadow-soft">
          {BUCKET_ORDER.map((b) => (
            <span key={b} className="flex items-center gap-1.5 text-caption text-ink">
              <span aria-hidden className="size-2.5 rounded-[3px]" style={{ backgroundColor: BUCKET_PILL[b].colour }} />
              {BUCKET_PILL[b].legend}
            </span>
          ))}
        </div>

        {calendar.months.filter((m) => m.month <= shown).map((cm) => {
          const month = months.get(cm.month);
          const byWeek = month ? actionsByWeek(month) : new Map<number | null, RoadmapMonth["focuses"][number]["actions"]>();
          const unscheduled = byWeek.get(null) ?? [];
          return (
            <section key={cm.month} id={`month-${cm.month}`} className="scroll-mt-4">
              <div className="flex items-baseline gap-2.5 px-0.5 pt-6 pb-3 first:pt-0">
                <span className="font-display text-body text-orange italic">{String(cm.month).padStart(2, "0")}</span>
                <MonthTitle roadmapId={roadmapId} month={cm.month} title={month?.title ?? ""} editable={editing} />
                <span className="text-caption text-ink/40">{monthName(cm.from)}</span>
                <span aria-hidden className="h-px flex-1 bg-ink/10" />
              </div>

              {cm.weeks.map((week) => (
                <WeekCard
                  key={week.index}
                  week={week}
                  themeTitle={month?.title ?? ""}
                  actions={(byWeek.get(week.weekOfMonth) ?? []).map(toView)}
                  open={week.index === currentWeekIndex}
                  editing={editing}
                  roadmapId={roadmapId}
                  trainings={trainings}
                />
              ))}

              {/* Actions with no week set are real, and shown rather than lost. */}
              {unscheduled.length > 0 ? (
                <WeekCard
                  week={null}
                  themeTitle={month?.title ?? ""}
                  actions={unscheduled.map(toView)}
                  open={false}
                  editing={editing}
                  roadmapId={roadmapId}
                  trainings={trainings}
                  monthNumber={cm.month}
                />
              ) : null}

              <ItineraryNote roadmapId={roadmapId} month={cm.month} body={notes.get(cm.month) ?? ""} editable={isOwner} />
            </section>
          );
        })}

        {shown < ROADMAP_MONTHS ? (
          <section id={`month-${shown + 1}`} className="scroll-mt-4">
            <div className="flex items-baseline gap-2.5 px-0.5 pt-6 pb-3">
              <span className="font-display text-body text-orange italic">
                {String(shown + 1).padStart(2, "0")}&ndash;{String(ROADMAP_MONTHS).padStart(2, "0")}
              </span>
              <span className="text-eyebrow font-semibold tracking-wide text-ink/45 uppercase">
                {shown + 1 >= 4 ? "Set at your Month 3 call" : "Still being written"}
              </span>
              <span aria-hidden className="h-px flex-1 bg-ink/10" />
            </div>
            <p className="mb-6 rounded-xl border border-dashed border-ink/20 px-4 py-4 text-center text-small text-ink/50">
              Weeks {calendar.months[shown].weeks[0].index}&ndash;{calendar.totalWeeks} follow the same card pattern once
              they&rsquo;re populated{shown + 1 >= 4 ? " at the Month 3 check-in call" : ""}.
              {editing ? " Add a theme or an action to the next month above to open it." : ""}
            </p>
          </section>
        ) : null}
      </div>
    </>
  );
}

function WeekCard({
  week, themeTitle, actions, open, editing, roadmapId, trainings, monthNumber,
}: {
  week: RoadmapWeek | null;
  themeTitle: string;
  actions: ActionView[];
  open: boolean;
  editing: boolean;
  roadmapId: string;
  trainings: Awaited<ReturnType<typeof getTrainingOptions>>;
  monthNumber?: number;
}) {
  const doneCount = actions.filter((a) => a.done).length;
  const pct = actions.length ? Math.round((doneCount / actions.length) * 100) : 0;
  // The badge's dot: the week's most common bucket.
  const tally = new Map<string, number>();
  for (const a of actions) if (a.bucket) tally.set(a.bucket, (tally.get(a.bucket) ?? 0) + 1);
  const dominant = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as keyof typeof BUCKET_PILL | undefined;
  const month = week?.month ?? monthNumber ?? 1;

  return (
    <details open={open} className="group mb-3 overflow-hidden rounded-2xl border border-ink/6 bg-card shadow-soft">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
        <span className="flex items-baseline gap-2.5">
          <span className="font-display text-heading font-medium text-ink">{week ? `Week ${week.index}` : "Unscheduled"}</span>
          <span className="text-caption text-ink/50">{week ? weekRange(week) : "No week set"}</span>
        </span>
        <span className="flex items-center gap-2.5">
          <span
            aria-label={`${pct}% done`}
            className="flex size-8 items-center justify-center rounded-full"
            style={{ background: `conic-gradient(var(--aos-orange) ${pct}%, rgba(10,30,74,0.10) 0)` }}
          >
            <span aria-hidden className="size-6 rounded-full bg-card" />
          </span>
          <span aria-hidden className="text-small text-ink transition group-open:rotate-180">▾</span>
        </span>
      </summary>
      <div className="px-5 pb-5">
        {actions.length > 0 && themeTitle ? (
          <p className="font-display mb-3 inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-cream-deep px-3 py-1 text-small text-ink italic">
            <span aria-hidden className="size-[7px] rounded-full" style={{ backgroundColor: dominant ? BUCKET_PILL[dominant].colour : "var(--aos-navy)" }} />
            {themeTitle}
          </p>
        ) : null}
        {actions.length === 0 ? (
          <p className="text-small text-ink/40 italic">Nothing scheduled this week</p>
        ) : (
          <ul className="flex flex-col">
            {actions.map((a) => (
              <ActionRow key={a.id} roadmapId={roadmapId} month={month} action={a} editable={editing} trainings={trainings} />
            ))}
          </ul>
        )}
        {editing ? <AddAction roadmapId={roadmapId} month={month} week={week?.weekOfMonth ?? null} trainings={trainings} /> : null}
      </div>
    </details>
  );
}
