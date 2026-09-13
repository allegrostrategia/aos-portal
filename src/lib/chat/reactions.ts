/**
 * The four reactions, and the shape a message's reactions take once summarised.
 *
 * Kept apart from queries.ts because the client-side picker needs the list and
 * the types, and queries.ts imports the server Supabase client — which must
 * never reach a browser bundle.
 */
export const REACTION_EMOJI = ["🙌", "🤩", "❤️", "👏"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJI)[number];

export type ReactionSummary = { emoji: ReactionEmoji; count: number; mine: boolean };
