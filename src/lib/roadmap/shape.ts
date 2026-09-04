/**
 * The shape of a roadmap.
 *
 * §3 keeps the roadmap as structured data rather than a document, and the
 * structure grew on 3 Sep: a month holds focuses, a focus holds actions, and an
 * action carries the training it points at, the week it's meant for, and a place
 * for the member to say how it went.
 *
 * The column is jsonb and the old shape — a flat list of phases each holding
 * items — is already on live. So this reads both. Normalising on read rather
 * than migrating the data means an old roadmap keeps working untouched, and
 * nothing has to be right about a one-off script run against real members'
 * plans.
 *
 * **Action ids are load-bearing.** `weekly_submissions.actions_taken` keys off
 * them, so re-ordering a month or rewording an action must not detach the ticks
 * a member has already made. The legacy fallback key is `<phase>:<item>` because
 * that is what the log has been writing since Step 5 — changing it would orphan
 * every tick made so far.
 */

export type RoadmapAction = {
  id: string;
  label: string;
  /** A specific training in the library, or null. */
  trainingId: string | null;
  /** Which week of the month this is meant for. Null means "no week set". */
  week: number | null;
};

export type RoadmapFocus = {
  id: string;
  title: string;
  stationSlug: string | null;
  actions: RoadmapAction[];
};

export type RoadmapMonth = {
  /** 1-based position in the roadmap, not a calendar month. */
  month: number;
  title: string;
  focuses: RoadmapFocus[];
};

/** Weeks a month can hold. Five, because some months have five Mondays. */
export const WEEKS_IN_MONTH = [1, 2, 3, 4, 5] as const;

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readAction(
  raw: unknown,
  fallbackId: string,
): RoadmapAction | null {
  // Legacy items were sometimes a bare string.
  if (typeof raw === "string") {
    const label = raw.trim();
    return label ? { id: fallbackId, label, trainingId: null, week: null } : null;
  }

  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;

  const label = asText(item.label) || asText(item.text);
  if (!label) return null;

  const week = Number(item.week);

  return {
    id: asText(item.id) || fallbackId,
    label,
    trainingId: asText(item.training_id) || asText(item.trainingId) || null,
    week: Number.isInteger(week) && week >= 1 && week <= 5 ? week : null,
  };
}

/**
 * Read whatever is in the column into the current shape.
 *
 * A legacy phase becomes a month with a single focus carrying its title and
 * station — which is what it always meant, just said in more words.
 */
export function readRoadmap(value: unknown): RoadmapMonth[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((rawMonth, monthIndex): RoadmapMonth | null => {
      if (!rawMonth || typeof rawMonth !== "object") return null;
      const month = rawMonth as Record<string, unknown>;

      const title = asText(month.title);
      const declaredMonth = Number(month.month);
      const position =
        Number.isInteger(declaredMonth) && declaredMonth >= 1
          ? declaredMonth
          : monthIndex + 1;

      if (Array.isArray(month.focuses)) {
        const focuses = month.focuses
          .map((rawFocus, focusIndex): RoadmapFocus | null => {
            if (!rawFocus || typeof rawFocus !== "object") return null;
            const focus = rawFocus as Record<string, unknown>;

            const actions = Array.isArray(focus.actions)
              ? focus.actions
                  .map((action, actionIndex) =>
                    readAction(action, `${monthIndex}:${focusIndex}:${actionIndex}`),
                  )
                  .filter((a): a is RoadmapAction => a !== null)
              : [];

            const focusTitle = asText(focus.title);
            if (!focusTitle && actions.length === 0) return null;

            return {
              id: asText(focus.id) || `${monthIndex}:${focusIndex}`,
              title: focusTitle,
              stationSlug: asText(focus.station_slug) || asText(focus.stationSlug) || null,
              actions,
            };
          })
          .filter((f): f is RoadmapFocus => f !== null);

        return focuses.length > 0 || title
          ? { month: position, title, focuses }
          : null;
      }

      // Legacy: a phase with items, which is one focus in the new shape. The
      // fallback action id stays `<phase>:<item>` — the key the weekly log has
      // been writing since Step 5.
      const items = Array.isArray(month.items) ? month.items : [];
      const actions = items
        .map((item, itemIndex) => readAction(item, `${monthIndex}:${itemIndex}`))
        .filter((a): a is RoadmapAction => a !== null);

      if (!title && actions.length === 0) return null;

      return {
        month: position,
        title: "",
        focuses: [
          {
            id: `${monthIndex}:0`,
            title,
            stationSlug: asText(month.station_slug) || null,
            actions,
          },
        ],
      };
    })
    .filter((m): m is RoadmapMonth => m !== null);
}

/** Every action across the whole roadmap, in reading order. */
export function allActions(
  months: RoadmapMonth[],
): { action: RoadmapAction; focus: RoadmapFocus; month: RoadmapMonth }[] {
  return months.flatMap((month) =>
    month.focuses.flatMap((focus) =>
      focus.actions.map((action) => ({ action, focus, month })),
    ),
  );
}

/**
 * A month's actions grouped by the week they're meant for.
 *
 * Actions with no week set come back under `null` rather than being dropped or
 * silently filed under week one — an unscheduled action is a real state, and
 * hiding it would lose work Nina has written down.
 */
export function actionsByWeek(
  month: RoadmapMonth,
): Map<number | null, RoadmapAction[]> {
  const byWeek = new Map<number | null, RoadmapAction[]>();

  for (const focus of month.focuses) {
    for (const action of focus.actions) {
      const existing = byWeek.get(action.week) ?? [];
      existing.push(action);
      byWeek.set(action.week, existing);
    }
  }

  return byWeek;
}
