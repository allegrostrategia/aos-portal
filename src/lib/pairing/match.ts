import { sharedSlots, type SlotId } from "./slots.ts";

/**
 * Who pairs with whom this month (§9).
 *
 * **Rotation, never skill or business type.** §9 is explicit and the reason is
 * explicit too: matching on anything about someone's business quietly
 * reintroduces hierarchy, and the point is that nobody is ever "the one who's
 * never picked". Nothing here reads the audit, the roadmap, or anything else
 * about who a member is — only who they have already met, and when.
 *
 * Availability is a preference, not a constraint. Two people who have never met
 * and share no free slot still get paired, with no proposed time; §9 has them
 * arranging the call themselves anyway. Leaving somebody unmatched to satisfy a
 * calendar is the one outcome this is most meant to avoid.
 *
 * Deterministic throughout — same input, same pairs — so a match can be
 * explained afterwards and tested at all.
 */

export type MemberId = string;

export type PastPairing = {
  /** First of the month, "2026-08-01". */
  month: string;
  members: MemberId[];
};

export type MatchInput = {
  /** Eligible members, in any order. */
  members: MemberId[];
  history: PastPairing[];
  availability: Map<MemberId, SlotId[]>;
  /** Nina, for the odd one out (§9). Null if there is no coach to pair with. */
  coachId: MemberId | null;
};

export type ProposedPairing = {
  members: [MemberId, MemberId];
  shared: SlotId[];
  withCoach: boolean;
};

export type MatchResult = {
  pairs: ProposedPairing[];
  /** Nobody, unless the count is odd and there is no coach available. */
  unmatched: MemberId[];
};

function lastPairedMonth(history: PastPairing[], member: MemberId): string {
  const months = history
    .filter((p) => p.members.includes(member))
    .map((p) => p.month)
    .sort();
  return months[months.length - 1] ?? "";
}

function lastPairedTogether(
  history: PastPairing[],
  a: MemberId,
  b: MemberId,
): string {
  const months = history
    .filter((p) => p.members.includes(a) && p.members.includes(b))
    .map((p) => p.month)
    .sort();
  return months[months.length - 1] ?? "";
}

export function matchPairings(input: MatchInput): MatchResult {
  const { history, availability, coachId } = input;
  const slotsFor = (id: MemberId) => availability.get(id) ?? [];

  // Never-paired sorts first because "" precedes any real month string.
  const waitedLongest = (a: MemberId, b: MemberId) => {
    const byWait = lastPairedMonth(history, a).localeCompare(
      lastPairedMonth(history, b),
    );
    return byWait !== 0 ? byWait : a.localeCompare(b);
  };

  let pool = [...new Set(input.members)]
    .filter((id) => id !== coachId)
    .sort(waitedLongest);

  const pairs: ProposedPairing[] = [];

  // The odd one out gets Nina (§9) — still an ordinary pairing, still mutual.
  //
  // Chosen deliberately rather than left as whoever falls out of the greedy
  // pass. Being paired with Nina counts as being paired, so the leftover would
  // sort as recently-paired next month and be likely to fall out again — the
  // same person getting the coach repeatedly, which is the opposite of rotation.
  if (pool.length % 2 === 1 && coachId) {
    const withCoachLongestAgo = [...pool].sort((a, b) => {
      const byCoach = lastPairedTogether(history, a, coachId).localeCompare(
        lastPairedTogether(history, b, coachId),
      );
      return byCoach !== 0 ? byCoach : waitedLongest(a, b);
    });

    const partner = withCoachLongestAgo[0];
    pool = pool.filter((id) => id !== partner);
    pairs.push({
      members: [partner, coachId],
      shared: sharedSlots(slotsFor(partner), slotsFor(coachId)),
      withCoach: true,
    });
  }

  const paired = new Set<MemberId>();

  for (const member of pool) {
    if (paired.has(member)) continue;

    const candidates = pool.filter((id) => id !== member && !paired.has(id));
    if (candidates.length === 0) break;

    const best = candidates.sort((a, b) => {
      // 1. Rotation: whoever this member has met least recently, never first.
      const byTogether = lastPairedTogether(history, member, a).localeCompare(
        lastPairedTogether(history, member, b),
      );
      if (byTogether !== 0) return byTogether;

      // 2. Then whoever has waited longest themselves.
      //
      // Availability isn't consulted here on purpose. It used to be, and the
      // repair pass below already accounts for it through `cost` — no test
      // could tell the two versions apart, which meant the branch was doing
      // nothing except looking like it mattered.
      return waitedLongest(a, b);
    })[0];

    paired.add(member);
    paired.add(best);
    pairs.push({
      members: [member, best],
      shared: sharedSlots(slotsFor(member), slotsFor(best)),
      withCoach: false,
    });
  }

  return {
    pairs: improve(pairs, history, availability, slotsFor),
    unmatched: pool.filter((id) => !paired.has(id)),
  };
}

/**
 * Undo the repeats greedy can't see coming.
 *
 * Greedy pairs whoever has waited longest with their best available partner,
 * one at a time — so it will happily pair the two people who have never met and
 * leave the two who met last month with only each other. The pairing it should
 * have made was available the whole time; it just wasn't visible one step ahead.
 *
 * So: try swapping the members of every two pairs, keep any swap that improves
 * the whole set, and repeat until nothing improves. With a membership this size
 * that's a handful of comparisons, and it turns "best next choice" into "best
 * arrangement" — which is what rotation actually asks for.
 *
 * The coach pairing is held out. It was chosen deliberately for its own reasons
 * and swapping Nina into an ordinary pair would undo that.
 */
function improve(
  pairs: ProposedPairing[],
  history: PastPairing[],
  availability: Map<MemberId, SlotId[]>,
  slotsFor: (id: MemberId) => SlotId[],
): ProposedPairing[] {
  const fixed = pairs.filter((p) => p.withCoach);
  let open = pairs.filter((p) => !p.withCoach);

  const remake = (a: MemberId, b: MemberId): ProposedPairing => ({
    members: [a, b],
    shared: sharedSlots(slotsFor(a), slotsFor(b)),
    withCoach: false,
  });

  for (let pass = 0; pass < open.length * open.length + 1; pass += 1) {
    let improved = false;

    outer: for (let i = 0; i < open.length; i += 1) {
      for (let j = i + 1; j < open.length; j += 1) {
        const [a, b] = open[i].members;
        const [c, d] = open[j].members;

        for (const swap of [
          [remake(a, c), remake(b, d)],
          [remake(a, d), remake(b, c)],
        ]) {
          const candidate = open.map((pair, index) =>
            index === i ? swap[0] : index === j ? swap[1] : pair,
          );

          if (cost(candidate, history) < cost(open, history)) {
            open = candidate;
            improved = true;
            break outer;
          }
        }
      }
    }

    if (!improved) break;
  }

  return [...fixed, ...open];
}

/**
 * How bad an arrangement is, lower being better.
 *
 * Three levels, in order: how many pairs are repeats at all, how recent the
 * worst repeat is, and how many pairs have no time in common. Repeats dominate
 * because rotation is the rule; availability breaks ties because §9 would
 * rather two people sort out a time themselves than meet the same person twice.
 *
 * Returned as a comparable string rather than a number so month strings can be
 * compared directly without inventing a numeric scale for dates.
 */
function cost(pairs: ProposedPairing[], history: PastPairing[]): string {
  const repeats = pairs
    .map((p) => lastPairedTogether(history, p.members[0], p.members[1]))
    .filter((month) => month !== "")
    .sort()
    .reverse();

  const withoutOverlap = pairs.filter((p) => p.shared.length === 0).length;

  return [
    String(repeats.length).padStart(4, "0"),
    repeats[0] ?? "0000-00-00",
    String(withoutOverlap).padStart(4, "0"),
  ].join("|");
}
