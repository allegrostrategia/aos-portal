/**
 * Reading more rows than PostgREST will hand over in one go.
 *
 * §13: "Watch the Supabase 1,000-row read limit — page or aggregate in SQL."
 * The limit is the dangerous kind: a query that asks for 1,500 rows gets
 * 1,000 and no error, so the page renders, looks right, and is quietly
 * missing a third of its data. Nothing fails; a count is just wrong.
 *
 * Most reporting queries are bounded by one workspace and one month and
 * cannot reach it. The admin client list is not: it reads every period of
 * every client, which is months × clients, and crosses 1,000 at around
 * forty clients with two years of history.
 */

/** PostgREST's default ceiling. Pages are requested at exactly this size. */
export const PAGE_SIZE = 1000;

export interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Fetch every row, a page at a time.
 *
 * Stops when a page comes back shorter than it asked for, which is the only
 * reliable signal that there is no more — a count header can be absent and
 * an empty page costs an extra round trip to discover.
 *
 * `maxPages` is a bound, not a limit on the data: an off-by-one in the range
 * arithmetic would otherwise loop forever against a live database, and a
 * crash is better than a hang.
 */
export async function fetchAllPages<T>(
  // PromiseLike, not Promise: a Supabase query builder is a thenable and
  // only becomes a Promise when awaited, so typing this as Promise rejects
  // every real call site.
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  { pageSize = PAGE_SIZE, maxPages = 50 }: { pageSize?: number; maxPages?: number } = {},
): Promise<T[]> {
  const all: T[] = [];

  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const { data, error } = await fetchPage(from, from + pageSize - 1);

    // A failed read must not look like the end of the data. Without this a
    // network blip becomes a page that renders with whatever arrived.
    if (error) throw new Error(`Could not read a page of rows: ${error.message}`);

    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }

  throw new Error(
    `Gave up after ${maxPages} pages of ${pageSize}. Something is wrong with the range arithmetic, or this needs aggregating in SQL instead.`,
  );
}
