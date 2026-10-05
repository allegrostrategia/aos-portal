/**
 * §8's three remaining pieces, driven through the app's own actions.
 *
 * Objectives, the client's reply, and the email when a month is published —
 * built on the plan Nina and Dom approved on 5 October 2026
 * (claude.ai/code/artifact/7e5a8f35-1801-4a1b-90c7-40321ca38a6b).
 *
 * All three are client-facing, so all three are exercised as the real people
 * against real policies: Nina, an assigned team member, and the retainer
 * client herself. The send is faked — nothing real is emailed — so what is
 * checked here is who it would go to, what the link says, and what gets
 * written down when it fails.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";
import { sent, reset, failNextSend } from "./stubs/email-send.mjs";
import { flushAfter } from "./stubs/next-server.mjs";

process.env.NEXT_PUBLIC_SITE_URL = "https://aos.allegrostrategia.com";

const { publishMonth, unpublishMonth, resendPublishEmail } = await import(
  "../../src/lib/reporting/note-actions.ts"
);
const { saveObjectives } = await import("../../src/lib/reporting/objective-actions.ts");
const { addClientReply, editClientReply } = await import(
  "../../src/lib/reporting/reply-actions.ts"
);
const { reportLinkFor } = await import("../../src/lib/reporting/publish-link.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const ELIZE = "22222222-2222-2222-2222-222222222222";
const CLIENT = "33333333-3333-3333-3333-333333333333";
const CLIENT_EMAIL = "bella@client.test";
const AUG = "2026-08-01";
const SEP = "2026-09-01";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'),
    ('${ELIZE}','elize@allegro.test'),
    ('${CLIENT}','${CLIENT_EMAIL}');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}','nina@allegro.test','Nina Oliver','admin','active');
`);

let workspace;
await asMember(db, NINA, async () => {
  const { rows } = await db.query(`
    select (public.create_report_workspace(
      '${CLIENT}', 'retainer', 'Bella Ltd', 'Bella Rossi', '${AUG}')).id as id`);
  workspace = rows[0].id;
  await db.query(
    `select public.assign_report_team_member('${workspace}', '${ELIZE}', 'Elize')`,
  );
  await db.query(
    `insert into public.report_periods (workspace_id, month) values
       ('${workspace}', '${AUG}'), ('${workspace}', '${SEP}')`,
  );
});

const form = (fields) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

const as = (uid) => configure(db, uid);

async function period(month) {
  const { rows } = await db.query(
    `select published_at, email_sent_at, email_error, email_to
       from public.report_periods where workspace_id = $1 and month = $2`,
    [workspace, month],
  );
  return rows[0];
}

async function notes(month, type) {
  const { rows } = await db.query(
    `select id, body, position, author_id, author_name, created_at
       from public.report_notes
      where workspace_id = $1 and month = $2 and note_type = $3
      order by position nulls last, created_at`,
    [workspace, month, type],
  );
  return rows;
}

// ---------------------------------------------------------------- objectives

test("Nina sets three objectives; a fourth has nowhere to go", async () => {
  as(NINA);
  const result = await saveObjectives(
    null,
    form({
      workspace_id: workspace,
      month: AUG,
      objective_1: "Put prices up on the retainer",
      objective_2: "Two case studies written",
      objective_3: "Stop answering email at weekends",
    }),
  );
  assert.equal(result.error, undefined);

  const rows = await notes(AUG, "objective");
  assert.deepEqual(
    rows.map((r) => r.position),
    [1, 2, 3],
    "three positions, and the database has no fourth to offer",
  );
  assert.equal(rows[0].author_name, "Nina Oliver");

  // The form offers three boxes; the table refuses a fourth outright.
  await assert.rejects(
    () =>
      db.query(
        `insert into public.report_notes
           (workspace_id, month, note_type, author_id, author_name, body, position)
         values ($1, $2, 'objective', $3, 'Nina Oliver', 'A fourth', 4)`,
        [workspace, AUG, NINA],
      ),
    /position_range|violates check/i,
  );
});

test("an assigned team member can set them too, as Nina decided", async () => {
  as(ELIZE);
  const result = await saveObjectives(
    null,
    form({
      workspace_id: workspace,
      month: SEP,
      objective_1: "Launch the September offer",
      objective_2: "",
      objective_3: "",
    }),
  );
  assert.equal(result.error, undefined);

  const rows = await notes(SEP, "objective");
  assert.equal(rows.length, 1, "only what was typed, no empty rows for show");
  assert.equal(rows[0].author_name, "Elize");
});

test("editing one Elize wrote is Nina's to do, not another team member's", async () => {
  // Nina, as admin, may adjust before publishing — the whole point of
  // letting Elize draft them.
  as(NINA);
  const ok = await saveObjectives(
    null,
    form({
      workspace_id: workspace,
      month: SEP,
      objective_1: "Launch the September offer, priced at 2k",
      objective_2: "",
      objective_3: "",
    }),
  );
  assert.equal(ok.error, undefined);
  const rows = await notes(SEP, "objective");
  assert.match(rows[0].body, /2k/);
  assert.equal(rows[0].author_name, "Elize", "still signed by whoever wrote it");
});

test("the client cannot set an objective, and cannot read one on a draft", async () => {
  as(CLIENT);
  const refused = await saveObjectives(
    null,
    form({ workspace_id: workspace, month: AUG, objective_1: "Mine now" }),
  );
  assert.match(refused.error, /only your strategist/i);

  // Not merely hidden: unreadable, as §13 requires.
  await asMember(db, CLIENT, async () => {
    const { rows } = await db.query(
      `select count(*)::int as n from public.report_notes
        where workspace_id = $1 and month = $2 and note_type = 'objective'`,
      [workspace, AUG],
    );
    assert.equal(rows[0].n, 0, "a draft month's objectives are not the client's to read");
  });
});

test("Nina's own note is signed with her name, not the client's", async () => {
  // The bug this file found: RLS hands an admin every grant on the
  // workspace, so `grants.find(workspace)` was returning the *client's* row
  // and every caller read `display_name` off it as its own. A note headed
  // "Notes from your strategist" was signed with the client's name, on the
  // one screen the client reads.
  const { saveStrategistNote } = await import("../../src/lib/reporting/note-actions.ts");

  as(NINA);
  const result = await saveStrategistNote(
    null,
    form({
      workspace_id: workspace,
      month: SEP,
      category: "",
      body: "September held up well.",
    }),
  );
  assert.equal(result.error, undefined);

  const [note] = await notes(SEP, "strategist");
  assert.equal(note.author_name, "Nina Oliver");
  assert.notEqual(note.author_name, "Bella Rossi");

  // And a team member signs as themselves, which is the other half of it.
  as(ELIZE);
  await saveStrategistNote(
    null,
    form({
      workspace_id: workspace,
      month: SEP,
      category: "financials",
      body: "Margin is thin on the retainer.",
    }),
  );
  const perCategory = (await notes(SEP, "strategist")).find((n) => n.body.includes("Margin"));
  assert.equal(perCategory.author_name, "Elize");
});

// ------------------------------------------------------------------ the email

test("publishing emails the client, and records that it went and to whom", async () => {
  reset();
  as(NINA);
  const result = await publishMonth(null, form({ workspace_id: workspace, month: AUG }));
  assert.equal(result.error, undefined);
  await flushAfter();

  const outbox = sent();
  assert.equal(outbox.length, 1, "one email, to one person");
  assert.equal(outbox[0].to, CLIENT_EMAIL, "the client contact, not the team");
  assert.match(outbox[0].subject, /August 2026 report is ready/);

  const row = await period(AUG);
  assert.ok(row.published_at, "published");
  assert.ok(row.email_sent_at, "and recorded as emailed");
  assert.equal(row.email_to, CLIENT_EMAIL);
  assert.equal(row.email_error, null);
});

test("the link comes from the site setting, and carries no figures", async () => {
  const outbox = sent();
  const body = outbox[outbox.length - 1].text;

  assert.match(
    body,
    new RegExp(`https://aos\\.allegrostrategia\\.com/reporting\\?workspace=${workspace}&month=2026-08`),
    "the live address, with the month the report's own URLs use",
  );
  assert.ok(!/localhost/.test(body), "never the request's origin");

  // §8's email is a notification, not the report. A figure in an inbox
  // outlives its correction. Checked on the prose with the link taken out:
  // the URL itself is full of digits, and they are not figures.
  const prose = body
    .split("\n")
    .filter((line) => !line.includes("http"))
    .join("\n");
  assert.ok(!/[£$]\s?\d/.test(prose), "no money in the email");
  assert.ok(!/\d/.test(prose.replace(/2026/g, "")), "no figures at all, just the month");
});

test("a published month the client can now read, and objectives with it", async () => {
  await asMember(db, CLIENT, async () => {
    const { rows } = await db.query(
      `select body from public.report_notes
        where workspace_id = $1 and month = $2 and note_type = 'objective'
        order by position`,
      [workspace, AUG],
    );
    assert.equal(rows.length, 3, "all three, now the month is published");
    assert.match(rows[0].body, /prices up/);
  });
});

test("a failed send leaves the month published and says why", async () => {
  reset();
  failNextSend("Resend 422: that address is suppressed");
  as(NINA);
  await publishMonth(null, form({ workspace_id: workspace, month: SEP }));
  await flushAfter();

  const row = await period(SEP);
  assert.ok(row.published_at, "the report stays readable; it does not depend on an email");
  assert.equal(row.email_sent_at, null);
  assert.match(row.email_error, /suppressed/);
  assert.equal(row.email_to, CLIENT_EMAIL, "who it would have gone to is still recorded");
});

test("Send again clears the error", async () => {
  reset();
  as(NINA);
  const result = await resendPublishEmail(
    null,
    form({ workspace_id: workspace, month: SEP }),
  );
  assert.equal(result.error, undefined);

  const row = await period(SEP);
  assert.ok(row.email_sent_at);
  assert.equal(row.email_error, null, "a retry that works does not leave the old reason up");
  assert.equal(sent().length, 1);
});

test("a republished month is worded as an update, not a new report", async () => {
  reset();
  as(NINA);
  await unpublishMonth(null, form({ workspace_id: workspace, month: AUG }));
  await publishMonth(null, form({ workspace_id: workspace, month: AUG }));
  await flushAfter();

  assert.equal(sent().length, 1);
  assert.match(sent()[0].subject, /has been updated/);
  assert.ok(
    !/is ready/.test(sent()[0].subject),
    "a client who already read August should not be told it is new",
  );
});

test("an unpublished month cannot be emailed about", async () => {
  reset();
  as(NINA);
  await unpublishMonth(null, form({ workspace_id: workspace, month: SEP }));
  const refused = await resendPublishEmail(
    null,
    form({ workspace_id: workspace, month: SEP }),
  );
  assert.match(refused.error, /isn't published/);
  assert.equal(sent().length, 0, "no link to a month the client cannot open");

  as(NINA);
  await publishMonth(null, form({ workspace_id: workspace, month: SEP }));
  await flushAfter();
  reset();
});

test("neither Elize nor the client can email a report", async () => {
  reset();
  as(ELIZE);
  assert.match(
    (await resendPublishEmail(null, form({ workspace_id: workspace, month: AUG }))).error,
    /only nina/i,
  );
  as(CLIENT);
  assert.match(
    (await resendPublishEmail(null, form({ workspace_id: workspace, month: AUG }))).error,
    /only nina/i,
  );
  assert.equal(sent().length, 0);
});

test("a team member cannot mark a month as emailed when none was sent", async () => {
  // The column-ownership trap: RLS grants the row, so without the guard
  // trigger covering these three columns an editor could write them.
  await asMember(db, ELIZE, async () => {
    await assert.rejects(
      () =>
        db.query(
          `update public.report_periods set email_sent_at = now(), email_to = 'elize@allegro.test'
            where workspace_id = $1 and month = $2`,
          [workspace, AUG],
        ),
      /Only an admin can publish a report/,
    );
    await assert.rejects(
      () =>
        db.query(
          `update public.report_periods set email_error = 'nothing wrong, honest'
            where workspace_id = $1 and month = $2`,
          [workspace, AUG],
        ),
      /Only an admin can publish a report/,
    );
  });
});

test("nor create a period that arrives already emailed", async () => {
  await asMember(db, ELIZE, async () => {
    await assert.rejects(
      () =>
        db.query(
          `insert into public.report_periods (workspace_id, month, email_sent_at)
           values ($1, '2026-10-01', now())`,
          [workspace],
        ),
      /Only an admin can publish a report/,
    );
  });
});

test("with no client login there is nobody to email, and the team is not it", async () => {
  // Removing the `role = 'client'` filter would quietly email whoever's
  // grant turned up first — which on a workspace with a team member is the
  // team member. Nina's decision of 5 October is the client contact only.
  let lonely;
  await asMember(db, NINA, async () => {
    const { rows } = await db.query(`
      select (public.create_report_workspace(
        '${CLIENT}', 'retainer', 'No Contact Ltd', 'Bella Rossi', '${AUG}')).id as id`);
    lonely = rows[0].id;
    // The client login removed, a team member left in its place.
    await db.query(`delete from public.report_access where workspace_id = $1`, [lonely]);
    await db.query(
      `select public.assign_report_team_member($1, '${ELIZE}', 'Elize')`,
      [lonely],
    );
  });

  reset();
  as(NINA);
  await publishMonth(null, form({ workspace_id: lonely, month: AUG }));
  await flushAfter();

  assert.equal(sent().length, 0, "nothing sent — Elize is not the client");

  const { rows } = await db.query(
    `select published_at, email_error, email_to from public.report_periods
      where workspace_id = $1 and month = $2`,
    [lonely, AUG],
  );
  assert.ok(rows[0].published_at, "the month is published either way");
  assert.match(rows[0].email_error, /no client login/i);
  assert.equal(rows[0].email_to, null);
});

test("a development site address refuses to send, and says so", () => {
  // The invitation bug, which cost an evening: a link built from a dev
  // machine works perfectly for whoever sent it and is dead for the client.
  for (const local of [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://doms-mac.local",
    "",
    null,
  ]) {
    const result = reportLinkFor(local, { workspaceId: workspace, month: AUG });
    assert.equal(result.ok, false, `${local} should not be emailable`);
    assert.match(result.error, /published/, "and should say the month is published anyway");
  }

  const live = reportLinkFor("https://aos.allegrostrategia.com/", {
    workspaceId: workspace,
    month: AUG,
  });
  assert.equal(live.ok, true);
  assert.equal(
    live.url,
    `https://aos.allegrostrategia.com/reporting?workspace=${workspace}&month=2026-08`,
    "one slash, and the month as the report's URLs carry it",
  );
});

// ------------------------------------------------------------ client replies

test("the client replies on a published month, and both of them see it", async () => {
  as(CLIENT);
  const result = await addClientReply(
    null,
    form({ workspace_id: workspace, month: AUG, body: "The ad spend looks high to me." }),
  );
  assert.equal(result.error, undefined);

  const rows = await notes(AUG, "client_reply");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].author_name, "Bella Rossi");

  for (const [who, uid] of [["Nina", NINA], ["Elize", ELIZE], ["the client", CLIENT]]) {
    await asMember(db, uid, async () => {
      const { rows: seen } = await db.query(
        `select count(*)::int as n from public.report_notes
          where workspace_id = $1 and month = $2 and note_type = 'client_reply'`,
        [workspace, AUG],
      );
      assert.equal(seen[0].n, 1, `${who} reads the reply`);
    });
  }
});

test("more than once, oldest first", async () => {
  as(CLIENT);
  await addClientReply(
    null,
    form({ workspace_id: workspace, month: AUG, body: "And one more thing." }),
  );

  const rows = await notes(AUG, "client_reply");
  assert.equal(rows.length, 2, "a report can become a conversation (Nina, 5 Oct)");
  assert.match(rows[0].body, /ad spend/, "oldest first");
  assert.match(rows[1].body, /one more thing/);
});

test("the client rewords their own reply, and nobody else's", async () => {
  const [first] = await notes(AUG, "client_reply");

  as(CLIENT);
  const ok = await editClientReply(
    null,
    form({ note_id: first.id, body: "The ad spend looks high to me — can we talk?" }),
  );
  assert.equal(ok.error, undefined);
  assert.match((await notes(AUG, "client_reply"))[0].body, /can we talk/);

  // Nina's note is not theirs to rewrite.
  await asMember(db, NINA, async () => {
    await db.query(
      `insert into public.report_notes
         (workspace_id, month, note_type, author_id, author_name, body)
       values ($1, $2, 'strategist', $3, 'Nina Oliver', 'August was strong.')`,
      [workspace, AUG, NINA],
    );
  });
  const [note] = await notes(AUG, "strategist");

  as(CLIENT);
  const refused = await editClientReply(
    null,
    form({ note_id: note.id, body: "August was terrible, actually." }),
  );
  assert.match(refused.error, /isn't yours/);
  assert.match((await notes(AUG, "strategist"))[0].body, /was strong/);
});

test("a reply cannot be emptied, and cannot be deleted", async () => {
  const [first] = await notes(AUG, "client_reply");

  as(CLIENT);
  const refused = await editClientReply(null, form({ note_id: first.id, body: "   " }));
  assert.match(refused.error, /not emptied/);

  await asMember(db, CLIENT, async () => {
    const { rows } = await db.query(
      `with gone as (delete from public.report_notes where id = $1 returning 1)
       select count(*)::int as n from gone`,
      [first.id],
    );
    assert.equal(rows[0].n, 0, "no delete policy admits them — a reply, once sent, stays");
  });
  assert.equal((await notes(AUG, "client_reply")).length, 2);
});

test("the client cannot reply to a draft month", async () => {
  as(NINA);
  await unpublishMonth(null, form({ workspace_id: workspace, month: AUG }));

  as(CLIENT);
  const refused = await addClientReply(
    null,
    form({ workspace_id: workspace, month: AUG, body: "Sneaking in." }),
  );
  assert.ok(refused.error, "refused");
  assert.equal(
    (await notes(AUG, "client_reply")).length,
    2,
    "nothing was written",
  );

  as(NINA);
  await publishMonth(null, form({ workspace_id: workspace, month: AUG }));
  await flushAfter();
});

test("the client cannot turn their reply into a note from their strategist", async () => {
  const [first] = await notes(AUG, "client_reply");

  await asMember(db, CLIENT, async () => {
    for (const change of [
      `note_type = 'strategist'`,
      `author_name = 'Nina Oliver'`,
      `month = '${SEP}'`,
      `category = 'financials'`,
    ]) {
      await assert.rejects(
        () => db.query(`update public.report_notes set ${change} where id = $1`, [first.id]),
        /what it is and who wrote it cannot/,
        change,
      );
    }
  });
});

test("the team cannot edit the client's words, or their own notes, through the reply box", async () => {
  // The reply action is the client's. Nina's `for all` admin policy would
  // otherwise let her through it — a strategist silently rewriting a
  // client's reply is the one edit this thread must not allow.
  const [reply] = await notes(AUG, "client_reply");

  as(NINA);
  const refusedReply = await editClientReply(
    null,
    form({ note_id: reply.id, body: "The ad spend is fine." }),
  );
  assert.match(refusedReply.error, /isn't yours/);
  assert.equal((await notes(AUG, "client_reply"))[0].body, reply.body, "untouched");

  // And it is not a back door to her own notes either: this action edits
  // replies, and nothing else.
  await asMember(db, NINA, async () => {
    await db.query(
      `insert into public.report_notes
         (workspace_id, month, note_type, author_id, author_name, body)
       values ($1, $2, 'strategist', $3, 'Nina Oliver', 'A note to leave alone.')`,
      [workspace, SEP, NINA],
    );
  });
  const own = (await notes(SEP, "strategist")).find((n) => n.body.includes("leave alone"));

  as(NINA);
  const refusedNote = await editClientReply(
    null,
    form({ note_id: own.id, body: "Rewritten through the wrong door." }),
  );
  assert.ok(refusedNote.error, "refused");
  assert.match(
    (await notes(SEP, "strategist")).find((n) => n.id === own.id).body,
    /leave alone/,
  );
});
