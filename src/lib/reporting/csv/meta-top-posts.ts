import { cellNumber, readTable } from "./tokenise.ts";
import { inMonth, parseExportDate } from "./dates.ts";
import { isSafeUrl, postTypeFrom, topThree, type TopPost } from "../top-posts.ts";

/**
 * The month's top three posts, out of the Meta content export.
 *
 * A second reader over the same file rather than more of
 * `readMetaContent`: that one answers "what are this month's account
 * figures", this one answers "which three posts did best", and the two
 * have different rules about the very same columns. Summed reach is
 * refused there (§10.1 — it double counts anybody who saw two posts) and
 * per-post reach is exactly what ranks a list here.
 *
 * **The Permalink column stops being ignored, and the Description
 * column does not.** §10.1 says captions are never stored and Nina
 * confirmed that on 11 November when she was offered a snippet: the link
 * opens the post, which has the caption in it. So this reads the URL and
 * reads past the words.
 */
export function readMetaTopPosts(text: string, month: string): TopPost[] {
  const { headers, rows } = readTable(text);
  const lower = headers.map((h) => h.toLowerCase());
  if (!lower.includes("publish time") || !lower.includes("permalink")) return [];

  const mine = rows.filter((row) => inMonth(parseExportDate(row["publish time"], "us"), month));

  const candidates = mine
    .map((row) => {
      const url = String(row["permalink"] ?? "").trim();
      const likes = cellNumber(row["likes"]);
      const comments = cellNumber(row["comments"]);
      return {
        url,
        postedOn: parseExportDate(row["publish time"], "us"),
        postType: postTypeFrom(row["post type"]),
        reach: cellNumber(row["reach"]),
        views: cellNumber(row["views"]),
        // Added here rather than stored as two columns, because §5.2
        // asks for the pair as one figure everywhere else on the page.
        // Null only when neither is there: one of the two is a real
        // answer, and treating a missing comments column as zero is how
        // a post with 200 likes reads as having none.
        likesPlusComments:
          likes === null && comments === null ? null : (likes ?? 0) + (comments ?? 0),
        saves: cellNumber(row["saves"]),
        shares: cellNumber(row["shares"]),
      };
    })
    // A row with no usable link is not a top post: the whole card is a
    // list of things to click.
    .filter((post) => isSafeUrl(post.url));

  return topThree(candidates).map((post, index) => ({ ...post, rank: index + 1 }));
}
