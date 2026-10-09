import { cellNumber, readTable } from "./tokenise.ts";
import { inMonth, parseExportDate } from "./dates.ts";

/**
 * §10.1: the Meta Business Suite content export, one row per post.
 *
 * Fills Social Media. What it deliberately does not fill is as much of
 * the specification as what it does.
 */

export interface ImportResult {
  /** Metric key to value, for the boxes to be filled with. */
  figures: Record<string, number>;
  /** Fields this file cannot fill, said plainly, for the card to list. */
  cannotFill: string[];
  /** How many rows were read, and how many were outside the month. */
  rowsUsed: number;
  rowsOutsideMonth: number;
  /** Fatal: nothing was filled and this is why. */
  problem?: string;
}

/**
 * Columns the file has that we never read. Named so the card can say
 * "ignored" rather than leaving somebody wondering.
 *
 * **Captions are never stored** (§10.1), which is why Description and
 * Permalink are read past rather than kept anywhere.
 */
const IGNORED = ["post id", "account id", "description", "permalink", "data comment"];

export function readMetaContent(text: string, month: string): ImportResult {
  const { headers, rows } = readTable(text);
  if (rows.length === 0) {
    return {
      figures: {},
      cannotFill: [],
      rowsUsed: 0,
      rowsOutsideMonth: 0,
      problem: "That file has no rows in it.",
    };
  }

  const lower = headers.map((h) => h.toLowerCase());
  if (!lower.includes("publish time") || !lower.includes("views")) {
    return {
      figures: {},
      cannotFill: [],
      rowsUsed: 0,
      rowsOutsideMonth: 0,
      problem:
        "That does not look like a Meta content export — it has no Publish time or Views column.",
    };
  }

  // **Lifetime totals to the export date** (§10.1), so only posts
  // published in the report month count. Everything else is read past
  // and counted, so the card can say how many.
  const mine = rows.filter((row) => inMonth(parseExportDate(row["publish time"], "us"), month));
  const outside = rows.length - mine.length;

  const sum = (column: string) =>
    mine.reduce((total, row) => total + (cellNumber(row[column]) ?? 0), 0);

  const figures: Record<string, number> = {
    social_media_posts_published: mine.length,
    social_media_views: sum("views"),
    social_media_likes_plus_comments: sum("likes") + sum("comments"),
    social_media_shares: sum("shares"),
    social_media_saves: sum("saves"),
    // §10.1: Meta only credits a follow to a specific post, so this is
    // usually lower than the real number. The brief asks for it to read
    // "follows from posts" on screen for that reason.
    social_media_follows_gained: sum("follows"),
  };

  return {
    figures,
    cannotFill: [
      // **Reach is never summed** (§10.1). Summed post reach double
      // counts people who saw several posts and misses stories and
      // older posts: in the sample, posts summed to 18,000 against an
      // account reach of 30,000. Wrong in both directions at once, so
      // there is no correction — it has to come from the account-level
      // export or be typed.
      "Reach — summed post reach is not account reach, so type it from the Overview export",
      "Followers at month end",
      "Profile visits",
      // §10.1: the file does not mark which reels were trials.
      "Trial Reels — the file does not say which reels were trials",
    ],
    rowsUsed: mine.length,
    rowsOutsideMonth: outside,
  };
}

export const CONTENT_IGNORED_COLUMNS = IGNORED;
