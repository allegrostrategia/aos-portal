import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchAllPages } from "./paging.ts";

/** A fake table of `total` rows, served in pages like PostgREST does. */
function fakeTable(total: number, pageSize: number) {
  const calls: [number, number][] = [];
  const rows = Array.from({ length: total }, (_, i) => ({ i }));
  return {
    calls,
    fetchPage: async (from: number, to: number) => {
      calls.push([from, to]);
      // PostgREST will not return more than its ceiling however wide the
      // range asked for.
      return { data: rows.slice(from, Math.min(to + 1, from + pageSize)), error: null };
    },
  };
}

test("a table smaller than one page takes one request", async () => {
  const t = fakeTable(42, 1000);
  const rows = await fetchAllPages(t.fetchPage);
  assert.equal(rows.length, 42);
  assert.equal(t.calls.length, 1);
});

test("an exactly-full page is not mistaken for the end", async () => {
  // The off-by-one that matters: 1,000 rows looks identical to "the first
  // 1,000 of more" until you ask again.
  const t = fakeTable(1000, 1000);
  const rows = await fetchAllPages(t.fetchPage);
  assert.equal(rows.length, 1000);
  assert.equal(t.calls.length, 2, "it asks again and gets an empty page");
});

test("more rows than the ceiling all come back", async () => {
  // The admin client list at forty clients with two years each.
  const t = fakeTable(2400, 1000);
  const rows = await fetchAllPages(t.fetchPage);
  assert.equal(rows.length, 2400);
  assert.deepEqual(t.calls, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("an empty table is empty, not an error", async () => {
  const t = fakeTable(0, 1000);
  assert.deepEqual(await fetchAllPages(t.fetchPage), []);
});

test("a failed page stops everything rather than looking like the end", async () => {
  // Otherwise a blip halfway through renders a page with two thirds of the
  // data and no sign anything went wrong.
  let call = 0;
  await assert.rejects(
    () => fetchAllPages(async (from) => {
      call++;
      if (call === 2) return { data: null, error: { message: "connection reset" } };
      return { data: Array.from({ length: 1000 }, (_, i) => ({ i: from + i })), error: null };
    }),
    /connection reset/,
  );
  assert.equal(call, 2, "it stopped at the failure");
});

test("it refuses to loop forever", async () => {
  // A range bug that always returns a full page would otherwise hang against
  // a live database. Crashing says where to look.
  await assert.rejects(
    () => fetchAllPages(
      async () => ({ data: Array.from({ length: 10 }, (_, i) => ({ i })), error: null }),
      { pageSize: 10, maxPages: 3 },
    ),
    /Gave up after 3 pages/,
  );
});
