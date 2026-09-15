import type { HotSeatComment } from "@/lib/hot-seat/queries";
import { formatSessionTimeShort } from "@/lib/time-zone";

/**
 * The thread on a hot seat submission (round 3, §B): Nina's notes before the
 * call and the member's replies, oldest first. Nina's are on the left in
 * lemon, the member's on the right in cream-deep, so who said what reads
 * without the names, though the names are there too.
 *
 * Rendered by both the member's page and the prep sheet. The reply form is
 * the caller's, since the two sides post through different actions.
 *
 * `archived`: once the build is confirmed, the thread is history. It folds
 * behind a "View archived comments" toggle so the confirmed build is what the
 * page shows, and the conversation that led to it is one click away rather
 * than gone. A `<details>`, so it works without JavaScript.
 */
export function Thread({
  comments,
  labelFor,
  archived = false,
  children,
}: {
  comments: HotSeatComment[];
  /** Who to show for a comment: "Nina", "You", a first name. */
  labelFor: (comment: HotSeatComment) => string;
  archived?: boolean;
  children?: React.ReactNode;
}) {
  const list =
    comments.length === 0 ? (
      <p className="text-small text-ink/60">
        Nothing here yet. Nina reads submissions before the call and leaves a
        note if there is something to think about first.
      </p>
    ) : (
      <ol className="flex flex-col gap-3">
        {comments.map((comment) => (
          <li
            key={comment.id}
            className={`flex flex-col ${comment.fromCoach ? "items-start" : "items-end"}`}
          >
            <p className="mb-1 text-caption text-ink/55">
              {labelFor(comment)} · {formatSessionTimeShort(comment.created_at)}
            </p>
            <p
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-small whitespace-pre-wrap break-words text-ink ${
                comment.fromCoach ? "bg-lemon/40" : "bg-cream-deep"
              }`}
            >
              {comment.body}
            </p>
          </li>
        ))}
      </ol>
    );

  if (archived) {
    if (comments.length === 0) return null;
    return (
      <details className="group mt-5">
        <summary className="cursor-pointer list-none text-small text-ink/70 underline underline-offset-4 hover:text-ink">
          <span className="group-open:hidden">View archived comments ({comments.length})</span>
          <span className="hidden group-open:inline">Hide archived comments</span>
        </summary>
        <div className="mt-3 rounded-2xl border border-ink/10 p-4">{list}</div>
      </details>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {list}
      {children}
    </div>
  );
}
