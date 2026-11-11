/**
 * The month's top posts, per platform (Nina, 11 November).
 *
 * Three ranked rows per platform per month: a link, a date, the kind of
 * post and its figures. **No caption** — the link opens the post, and
 * §10.1's "captions are never stored" stays true as written, which is
 * the first thing this file checks.
 *
 * The rest is the shape every other table of month content has: a
 * client reads them when the month is published and not before, a
 * published month refuses the write, and a row belongs to a platform
 * that is theirs.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";
import { flushAfter } from "./stubs/next-server.mjs";

process.env.NEXT_PUBLIC_SITE_URL = "https://aos.allegrostrategia.com";

const { saveTopPosts } = await import("../../src/lib/reporting/top-post-actions.ts");
const { getTopPosts } = await import("../../src/lib/reporting/top-post-queries.ts");
const { publishMonth } = await import("../../src/lib/reporting/note-actions.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const ELIZE = "22222222-2222-2222-2222-222222222222";
const CLIENT = "33333333-3333-3333-3333-333333333333";
const SEP = "2026-09-01";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${ELIZE}','elize@allegro.test'),
    ('${CLIENT}','bella@client.test');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}','nina@allegro.test','Nina Oliver','admin','active');
`);

let WS;
let OTHER;
let IG;
let LI;
let THEIRS;
let OFFER;
await asMember(db, NINA, async () => {
  WS = (
    await db.query(`select (public.create_report_workspace(
      '${CLIENT}', 'retainer', 'Northwind Studio', 'Bella Test', '${SEP}')).id as id`)
  ).rows[0].id;
  OTHER = (
    await db.query(`select (public.create_report_workspace(
      '${CLIENT}', 'retainer', 'Somebody Else', 'Bella Test', '${SEP}')).id as id`)
  ).rows[0].id;
  await db.query(`select public.assign_report_team_member('${WS}', '${ELIZE}', 'Elize')`);

  const made = await db.query(
    `insert into public.report_entities (workspace_id, entity_type, name, sort_order)
     values ('${WS}', 'social_platform', 'Instagram', 1),
            ('${WS}', 'social_platform', 'LinkedIn', 2),
            ('${WS}', 'offer', 'Signature programme', 1)
     returning id, name, entity_type`,
  );
  IG = made.rows.find((r) => r.name === "Instagram").id;
  LI = made.rows.find((r) => r.name === "LinkedIn").id;
  OFFER = made.rows.find((r) => r.entity_type === "offer").id;

  THEIRS = (
    await db.query(`insert into public.report_entities (workspace_id, entity_type, name)
                    values ('${OTHER}', 'social_platform', 'Instagram') returning id`)
  ).rows[0].id;
});

const as = (uid, fn) => {
  configure(db, uid);
  return fn();
};
const form = (fields) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, String(v));
  return f;
};
const rows = async (sql) => (await asMember(db, NINA, () => db.query(sql))).rows;

const save = (uid, platformId, fields) =>
  as(uid, () =>
    saveTopPosts(null, form({ workspace_id: WS, month: SEP, platform_id: platformId, ...fields })),
  );

const postsFor = (uid, platformId) => {
  configure(db, uid);
  return getTopPosts(WS, SEP, platformId);
};

test("three posts save against the platform they were entered on", async () => {
  const result = await save(ELIZE, IG, {
    "post:1:url": "https://www.instagram.com/p/one/",
    "post:1:posted_on": "2026-09-02",
    "post:1:post_type": "reel",
    "post:1:reach": "3,000",
    "post:1:views": "4000",
    "post:1:likes": "230",
    "post:1:saves": "40",
    "post:1:shares": "20",
    "post:2:url": "https://www.instagram.com/p/two/",
    "post:2:post_type": "carousel",
    "post:2:reach": "2500",
  });
  assert.equal(result?.error, undefined, result?.error);

  const posts = await postsFor(ELIZE, IG);
  assert.equal(posts.length, 2);
  assert.deepEqual(
    posts.map((p) => [p.rank, p.url, p.reach]),
    [
      [1, "https://www.instagram.com/p/one/", 3000],
      [2, "https://www.instagram.com/p/two/", 2500],
    ],
    "a comma in a figure is a figure",
  );
  assert.equal(posts[0].postType, "reel");
  assert.equal(posts[0].likesPlusComments, 230);
  assert.equal(posts[1].postedOn, null, "a date nobody gave is a dash, not today");

  assert.deepEqual(await postsFor(ELIZE, LI), [], "and LinkedIn's list is its own");
});

test("no caption is stored, because there is nowhere to put one", async () => {
  // Nina, 11 November, reversing the proposal that kept a snippet. The
  // table is the assertion: a column that does not exist cannot be
  // filled by a later change nobody reviews.
  const columns = await rows(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'report_top_posts'
      order by column_name`,
  );
  const names = columns.map((c) => c.column_name);
  for (const forbidden of ["caption", "snippet", "description", "body", "text"]) {
    assert.ok(!names.includes(forbidden), `no ${forbidden} column`);
  }
  assert.deepEqual(names, [
    "created_at",
    "entity_id",
    "id",
    "likes_plus_comments",
    "month",
    "post_type",
    "posted_on",
    "rank",
    "reach",
    "saves",
    "shares",
    "source",
    "updated_at",
    "url",
    "views",
    "workspace_id",
  ]);
});

test("a link that is not a link is refused, on the screen and in the column", async () => {
  const refused = await save(ELIZE, IG, { "post:3:url": "javascript:alert(1)" });
  assert.match(refused?.error ?? "", /should start with https/);

  // And by hand, past the action altogether — the one string that turns
  // a client's report into somewhere to run code.
  await assert.rejects(
    () =>
      asMember(db, NINA, () =>
        db.query(`insert into public.report_top_posts (workspace_id, month, entity_id, rank, url)
                  values ('${WS}', '${SEP}', '${IG}', 3, 'javascript:alert(1)')`),
      ),
    /report_top_posts_url_is_http/,
  );
});

test("figures with no link are refused rather than quietly dropped", async () => {
  const refused = await save(ELIZE, IG, { "post:3:reach": "900" });
  assert.match(refused?.error ?? "", /Post 3 needs a link/);
});

test("clearing a row takes that post off the report", async () => {
  const result = await save(ELIZE, IG, {
    "post:1:url": "https://www.instagram.com/p/one/",
    "post:1:reach": "3000",
  });
  assert.equal(result?.error, undefined, result?.error);

  const posts = await postsFor(ELIZE, IG);
  assert.equal(posts.length, 1, "the second row was emptied, so it is gone");
  assert.equal(posts[0].rank, 1);
});

test("a post can only be on this client's own platform", async () => {
  const refused = await save(ELIZE, THEIRS, { "post:1:url": "https://x/1" });
  assert.match(refused?.error ?? "", /isn't this client's/);

  // The database says the same, for the write that never goes near the
  // action. An offer is not a platform either.
  await assert.rejects(
    () =>
      asMember(db, NINA, () =>
        db.query(`insert into public.report_top_posts (workspace_id, month, entity_id, rank, url)
                  values ('${WS}', '${SEP}', '${OFFER}', 1, 'https://x/1')`),
      ),
    /belongs to a social platform/,
  );
  await assert.rejects(
    () =>
      asMember(db, NINA, () =>
        db.query(`insert into public.report_top_posts (workspace_id, month, entity_id, rank, url)
                  values ('${WS}', '${SEP}', '${THEIRS}', 1, 'https://x/1')`),
      ),
    /own platform/,
  );
});

test("the client cannot see them until the month is published, and cannot write one", async () => {
  assert.deepEqual(await postsFor(CLIENT, IG), [], "a draft month is the team's");

  const refused = await save(CLIENT, IG, { "post:1:url": "https://x/1" });
  assert.match(refused?.error ?? "", /filled in by your Allegro team|don't have access/);

  await as(NINA, () => publishMonth(null, form({ workspace_id: WS, month: SEP })));
  await flushAfter();

  const seen = await postsFor(CLIENT, IG);
  assert.equal(seen.length, 1, "and now it is theirs to read");
  assert.equal(seen[0].url, "https://www.instagram.com/p/one/");
});

test("a published month refuses a change, as every other table of month content does", async () => {
  const refused = await save(ELIZE, IG, {
    "post:1:url": "https://www.instagram.com/p/changed/",
  });
  assert.match(refused?.error ?? "", /published/i);

  const posts = await postsFor(ELIZE, IG);
  assert.equal(posts[0].url, "https://www.instagram.com/p/one/", "unchanged");
});
