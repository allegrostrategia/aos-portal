/**
 * Funnels (§5.5), and the price a month keeps.
 *
 * Funnel revenue is purchases × the linked offer's price, and the price
 * moves — so the month captures one and holds on to it. Dom's rules,
 * 6 October, driven here through the real actions against real policies:
 *
 *   1. captured on the first save of that funnel month;
 *   2. later saves leave it alone — **December must not rewrite June**;
 *   3. a published month never changes it, by any route;
 *   4. the correction is a button, on unpublished months only;
 *   5. pointing the funnel at another offer takes the new price.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./hooks.mjs";
import { createTestDatabase, asMember } from "./pglite.mjs";
import { configure } from "./stubs/supabase-server.mjs";

const { saveFunnel, saveFunnelMonth, useCurrentOfferPrice, retireFunnel } = await import(
  "../../src/lib/reporting/funnel-actions.ts"
);
const { saveOffer } = await import("../../src/lib/reporting/offer-actions.ts");
const { publishMonth } = await import("../../src/lib/reporting/note-actions.ts");
const { resolveReportContext } = await import("../../src/lib/reporting/context.ts");
const { getMonthFigures } = await import("../../src/lib/reporting/month-figures.ts");
const { calculateFunnel } = await import("../../src/lib/reporting/calculate.ts");

const NINA = "11111111-1111-1111-1111-111111111111";
const CLIENT = "22222222-2222-2222-2222-222222222222";
const JUN = "2026-06-01";
const DEC = "2026-12-01";

const db = await createTestDatabase();

await db.exec(`
  insert into auth.users (id, email) values
    ('${NINA}','nina@allegro.test'), ('${CLIENT}','bella@client.test');
  insert into public.members (id, email, full_name, role, status)
    values ('${NINA}','nina@allegro.test','Nina Oliver','admin','active');
`);

const WS = (
  await asMember(db, NINA, () =>
    db.query(`select (public.create_report_workspace(
      '${CLIENT}', 'retainer', 'Northwind Studio', 'Bella Test', '${JUN}')).id as id`),
  )
).rows[0].id;

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

const entityId = async (type, name) =>
  (
    await rows(`select id from public.report_entities
                 where workspace_id = '${WS}' and entity_type = '${type}' and name = '${name}'`)
  )[0].id;

const capturedPrice = async (funnelId, month) => {
  const found = await rows(`
    select value::float v from public.report_values
     where workspace_id = '${WS}' and month = '${month}'
       and metric_key = 'funnels_offer_price_at_month' and entity_id = '${funnelId}'`);
  return found[0]?.v ?? null;
};

const setOfferPrice = (offerId, price) =>
  as(NINA, () =>
    saveOffer(
      null,
      form({
        workspace_id: WS,
        offer_id: offerId,
        name: "Signature programme",
        price,
        pricing_model: "one_off",
        hourly_cost: 40,
      }),
    ),
  );

let offerId;
let funnelId;

test("a funnel is linked to one of this client's offers, and nobody else's", async () => {
  await as(NINA, () =>
    saveOffer(
      null,
      form({
        workspace_id: WS,
        name: "Signature programme",
        price: 500,
        pricing_model: "one_off",
        hourly_cost: 40,
      }),
    ),
  );
  offerId = await entityId("offer", "Signature programme");

  const created = await as(NINA, () =>
    saveFunnel(null, form({ workspace_id: WS, name: "Webinar funnel", linked_offer_id: offerId })),
  );
  assert.equal(created?.error, undefined, created?.error);
  funnelId = await entityId("funnel", "Webinar funnel");

  const refused = await as(NINA, () =>
    saveFunnel(
      null,
      form({
        workspace_id: WS,
        name: "Borrowed",
        linked_offer_id: "00000000-0000-0000-0000-00000000dead",
      }),
    ),
  );
  assert.match(refused?.error ?? "", /not one of this client's/);
});

test("rule 1: the first save captures the price as it stands", async () => {
  const result = await as(NINA, () =>
    saveFunnelMonth(
      null,
      form({
        workspace_id: WS,
        month: JUN,
        [`v:funnels_landing_page_views:${funnelId}`]: 1000,
        [`v:funnels_opt_ins:${funnelId}`]: 200,
        [`v:funnels_purchases:${funnelId}`]: 10,
      }),
    ),
  );
  assert.equal(result?.error, undefined, result?.error);
  assert.match(result?.notice ?? "", /price was captured/i);

  assert.equal(await capturedPrice(funnelId, JUN), 500);
});

test("rule 2: December does not rewrite June", async () => {
  // The price rises, and June is corrected afterwards — the case that
  // would have gone wrong if the price were captured on every save.
  await setOfferPrice(offerId, 800);

  const result = await as(NINA, () =>
    saveFunnelMonth(
      null,
      form({
        workspace_id: WS,
        month: JUN,
        [`v:funnels_purchases:${funnelId}`]: 11,
      }),
    ),
  );
  assert.equal(result?.error, undefined, result?.error);

  assert.equal(await capturedPrice(funnelId, JUN), 500, "June keeps the price it was sold at");

  const [purchases] = await rows(`
    select value::float v from public.report_values
     where workspace_id = '${WS}' and month = '${JUN}'
       and metric_key = 'funnels_purchases' and entity_id = '${funnelId}'`);
  assert.equal(purchases.v, 11, "and the correction itself did land");
});

test("a later month captures the new price, which is the point", async () => {
  await as(NINA, () =>
    saveFunnelMonth(
      null,
      form({
        workspace_id: WS,
        month: DEC,
        [`v:funnels_landing_page_views:${funnelId}`]: 2000,
        [`v:funnels_purchases:${funnelId}`]: 5,
      }),
    ),
  );

  assert.equal(await capturedPrice(funnelId, DEC), 800);
  assert.equal(await capturedPrice(funnelId, JUN), 500, "and June is still June");
});

test("revenue uses each month's own price", async () => {
  configure(db, NINA);
  const june = await getMonthFigures(
    await resolveReportContext({ workspace: WS, month: "2026-06" }, "2027-01-02"),
  );
  const december = await getMonthFigures(
    await resolveReportContext({ workspace: WS, month: "2026-12" }, "2027-01-02"),
  );

  const junePrice = calculateFunnel(june.funnelRows[0]);
  const decPrice = calculateFunnel(december.funnelRows[0]);

  assert.equal(junePrice.funnels_funnel_revenue, 5500, "11 × £500");
  assert.equal(decPrice.funnels_funnel_revenue, 4000, "5 × £800");
});

test("rule 4: the button takes the current price, on an unpublished month", async () => {
  const result = await as(NINA, () =>
    useCurrentOfferPrice(null, form({ workspace_id: WS, month: JUN, funnel_id: funnelId })),
  );
  assert.equal(result?.error, undefined, result?.error);
  assert.equal(await capturedPrice(funnelId, JUN), 800, "a deliberate correction");

  // Put June back where it was, for the publish test below.
  await setOfferPrice(offerId, 500);
  await as(NINA, () =>
    useCurrentOfferPrice(null, form({ workspace_id: WS, month: JUN, funnel_id: funnelId })),
  );
  assert.equal(await capturedPrice(funnelId, JUN), 500);
  await setOfferPrice(offerId, 800);
});

test("rule 3: once June is published, nothing moves its price", async () => {
  await as(NINA, () => publishMonth(null, form({ workspace_id: WS, month: JUN })));

  // The button.
  const button = await as(NINA, () =>
    useCurrentOfferPrice(null, form({ workspace_id: WS, month: JUN, funnel_id: funnelId })),
  );
  assert.match(button?.error ?? "", /published month keeps the price/i);
  assert.equal(await capturedPrice(funnelId, JUN), 500);

  // An ordinary re-save.
  await as(NINA, () =>
    saveFunnelMonth(
      null,
      form({ workspace_id: WS, month: JUN, [`v:funnels_purchases:${funnelId}`]: 12 }),
    ),
  );
  assert.equal(await capturedPrice(funnelId, JUN), 500);

  // And changing the linked offer.
  await as(NINA, () =>
    saveOffer(
      null,
      form({
        workspace_id: WS,
        name: "Second offer",
        price: 2000,
        pricing_model: "one_off",
        hourly_cost: 40,
      }),
    ),
  );
  const second = await entityId("offer", "Second offer");
  await as(NINA, () =>
    saveFunnel(
      null,
      form({
        workspace_id: WS,
        funnel_id: funnelId,
        name: "Webinar funnel",
        linked_offer_id: second,
        month: JUN,
      }),
    ),
  );
  assert.equal(await capturedPrice(funnelId, JUN), 500, "a published June is a published June");
});

test("rule 5: a different offer on an unpublished month takes its price", async () => {
  const first = await entityId("offer", "Signature programme");
  const result = await as(NINA, () =>
    saveFunnel(
      null,
      form({
        workspace_id: WS,
        funnel_id: funnelId,
        name: "Webinar funnel",
        linked_offer_id: first,
        month: DEC,
      }),
    ),
  );
  assert.equal(result?.error, undefined, result?.error);
  assert.match(result?.notice ?? "", /new offer's price/i);
  assert.equal(await capturedPrice(funnelId, DEC), 800, "the first offer is £800 by now");
});

test("a funnel with no linked offer earns a dash, not nothing", async () => {
  await as(NINA, () =>
    saveFunnel(null, form({ workspace_id: WS, name: "Unlinked funnel", linked_offer_id: "" })),
  );
  const unlinked = await entityId("funnel", "Unlinked funnel");

  await as(NINA, () =>
    saveFunnelMonth(
      null,
      form({
        workspace_id: WS,
        month: DEC,
        [`v:funnels_landing_page_views:${unlinked}`]: 400,
        [`v:funnels_purchases:${unlinked}`]: 3,
      }),
    ),
  );

  assert.equal(await capturedPrice(unlinked, DEC), null, "nothing to capture");

  configure(db, NINA);
  const figures = await getMonthFigures(
    await resolveReportContext({ workspace: WS, month: "2026-12" }, "2027-01-02"),
  );
  const row = figures.funnelRows.find((f) => f.id === unlinked);
  const results = calculateFunnel(row);

  assert.equal(results.funnels_funnel_revenue, null, "a dash, not £0");
  assert.equal(results.funnels_revenue_per_visitor, null);
  assert.equal(results.funnels_overall_conversion, 0.75, "the rates still work");
});

test("the client can do none of it", async () => {
  for (const run of [
    () => saveFunnel(null, form({ workspace_id: WS, name: "Mine", linked_offer_id: "" })),
    () => saveFunnelMonth(null, form({ workspace_id: WS, month: DEC, [`v:funnels_purchases:${funnelId}`]: 99 })),
    () => useCurrentOfferPrice(null, form({ workspace_id: WS, month: DEC, funnel_id: funnelId })),
    () => retireFunnel(null, form({ workspace_id: WS, funnel_id: funnelId })),
  ]) {
    const refused = await as(CLIENT, run);
    assert.match(refused?.error ?? "", /filled in by your strategist/);
  }
});

test("a price write that fails is reported, not swallowed", async () => {
  // Fault injection, because there is no other way to make this write
  // error. Without the error branch the screen says "Saved" while the
  // month silently has no price — and a month with no price shows a dash
  // for revenue, which looks like a missing figure rather than a bug.
  await db.exec(`
    create function public.break_price() returns trigger language plpgsql as $$
    begin
      if new.metric_key = 'funnels_offer_price_at_month' then
        raise exception 'price writes are broken';
      end if;
      return new;
    end; $$;
    create trigger break_price before insert on public.report_values
      for each row execute function public.break_price();
  `);

  let result;
  try {
    await as(NINA, () =>
      saveFunnel(null, form({ workspace_id: WS, name: "Fresh funnel", linked_offer_id: offerId })),
    );
    const fresh = await entityId("funnel", "Fresh funnel");
    result = await as(NINA, () =>
      saveFunnelMonth(
        null,
        form({
          workspace_id: WS,
          month: DEC,
          [`v:funnels_purchases:${fresh}`]: 4,
        }),
      ),
    );
  } finally {
    await db.exec(`
      drop trigger break_price on public.report_values;
      drop function public.break_price();
    `);
  }

  assert.match(result?.error ?? "", /not the price/i);
  assert.equal(result?.notice, undefined, "and it does not also claim success");
});
