# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ads.spec.ts >> the Leads tab shows the real figure from Ads, not a second box
- Location: e2e/ads.spec.ts:155:5

# Error details

```
Error: "New leads from ads" is not on the Leads page at all

expect(received).toBeTruthy()

Received: undefined
```

# Page snapshot

```yaml
- generic [ref=f3e2]:
  - banner [ref=f3e3]:
    - generic [ref=f3e4]:
      - generic [ref=f3e5]:
        - generic [ref=f3e6]:
          - paragraph [ref=f3e7]: Northwind Studio
          - heading "Leads & Conversions" [level=1] [ref=f3e8]
          - paragraph [ref=f3e9]: WHERE CLIENTS COME FROM · September 2026
        - generic [ref=f3e10]:
          - group [ref=f3e11]:
            - generic "Northwind Studio" [ref=f3e12] [cursor=pointer]
          - generic [ref=f3e16]:
            - link "The month before, August 2026" [ref=f3e17] [cursor=pointer]:
              - /url: /reporting/leads-conversions?workspace=2a6c9c41-e3c0-4702-9a02-c9f21cb24956&month=2026-08
            - group [ref=f3e20]:
              - generic "September 2026" [ref=f3e21] [cursor=pointer]
          - generic [ref=f3e28]: Draft
          - link "Enter data" [ref=f3e29] [cursor=pointer]:
            - /url: /reporting/enter/leads-conversions?workspace=2a6c9c41-e3c0-4702-9a02-c9f21cb24956&month=2026-09
          - button "Sign out" [ref=f3e31]
      - navigation "Report sections" [ref=f3e32]:
        - list [ref=f3e33]:
          - listitem [ref=f3e34]:
            - link "Overview" [ref=f3e35] [cursor=pointer]:
              - /url: /reporting?workspace=2a6c9c41-e3c0-4702-9a02-c9f21cb24956&month=2026-09
          - listitem [ref=f3e36]:
            - link "Social Media" [ref=f3e37] [cursor=pointer]:
              - /url: /reporting/social-media?workspace=2a6c9c41-e3c0-4702-9a02-c9f21cb24956&month=2026-09
          - listitem [ref=f3e38]:
            - link "Trial Reels" [ref=f3e39] [cursor=pointer]:
              - /url: /reporting/trial-reels?workspace=2a6c9c41-e3c0-4702-9a02-c9f21cb24956&month=2026-09
          - listitem [ref=f3e40]:
            - link "Email" [ref=f3e41] [cursor=pointer]:
              - /url: /reporting/email?workspace=2a6c9c41-e3c0-4702-9a02-c9f21cb24956&month=2026-09
          - listitem [ref=f3e42]:
            - link "Funnels" [ref=f3e43] [cursor=pointer]:
              - /url: /reporting/funnels?workspace=2a6c9c41-e3c0-4702-9a02-c9f21cb24956&month=2026-09
          - listitem [ref=f3e44]:
            - link "Leads & Conversions" [ref=f3e45] [cursor=pointer]:
              - /url: /reporting/leads-conversions?workspace=2a6c9c41-e3c0-4702-9a02-c9f21cb24956&month=2026-09
          - listitem [ref=f3e46]:
            - link "Ads" [ref=f3e47] [cursor=pointer]:
              - /url: /reporting/ads?workspace=2a6c9c41-e3c0-4702-9a02-c9f21cb24956&month=2026-09
          - listitem [ref=f3e48]:
            - link "Client Experience" [ref=f3e49] [cursor=pointer]:
              - /url: /reporting/client-experience?workspace=2a6c9c41-e3c0-4702-9a02-c9f21cb24956&month=2026-09
          - listitem [ref=f3e50]:
            - link "Offers" [ref=f3e51] [cursor=pointer]:
              - /url: /reporting/offers?workspace=2a6c9c41-e3c0-4702-9a02-c9f21cb24956&month=2026-09
          - listitem [ref=f3e52]:
            - link "Financials" [ref=f3e53] [cursor=pointer]:
              - /url: /reporting/financials?workspace=2a6c9c41-e3c0-4702-9a02-c9f21cb24956&month=2026-09
  - main [ref=f3e54]:
    - generic [ref=f3e55]:
      - generic [ref=f3e56]:
        - paragraph [ref=f3e57]: New leads from social
        - paragraph [ref=f3e58]: "20"
        - paragraph [ref=f3e59]:
          - generic [ref=f3e60]: ↑ 67%
          - generic [ref=f3e61]: vs. August
      - generic [ref=f3e62]:
        - paragraph [ref=f3e63]: New leads from email
        - paragraph [ref=f3e64]: "8"
        - paragraph [ref=f3e65]:
          - generic [ref=f3e66]: ↑ 33%
          - generic [ref=f3e67]: vs. August
      - generic [ref=f3e68]:
        - paragraph [ref=f3e69]: New clients
        - paragraph [ref=f3e70]: "4"
        - paragraph [ref=f3e71]:
          - generic [ref=f3e72]: ↓ 20%
          - generic [ref=f3e73]: vs. August
      - generic [ref=f3e74]:
        - paragraph [ref=f3e75]: Total leads
        - paragraph [ref=f3e76]: "28"
        - paragraph [ref=f3e77]:
          - generic [ref=f3e78]: ↑ 56%
          - generic [ref=f3e79]: vs. August
      - generic [ref=f3e80]:
        - paragraph [ref=f3e81]: Lead to client rate
        - paragraph [ref=f3e82]: 14.3%
        - paragraph [ref=f3e83]:
          - generic [ref=f3e84]: ↓ 49%
          - generic [ref=f3e85]: vs. August
    - generic [ref=f3e86]:
      - generic [ref=f3e87]:
        - heading "Where the leads came from" [level=2] [ref=f3e88]
        - generic [ref=f3e89]: September 2026
      - generic [ref=f3e90]:
        - list [ref=f3e91]:
          - listitem [ref=f3e92]:
            - generic [ref=f3e93]:
              - generic [ref=f3e94]: Social
              - generic [ref=f3e95]: "20"
          - listitem [ref=f3e99]:
            - generic [ref=f3e100]:
              - generic [ref=f3e101]: Email
              - generic [ref=f3e102]: "8"
        - paragraph [ref=f3e106]: New leads this month, by source.
    - generic [ref=f3e108]:
      - heading "Notes from your strategist" [level=2] [ref=f3e110]
      - generic [ref=f3e112]:
        - generic [ref=f3e113]: Your note for this month
        - textbox "Your note for this month" [ref=f3e114]:
          - /placeholder: What happened this month, and what you recommend next.
        - generic [ref=f3e115]:
          - paragraph
          - button "Save note" [ref=f3e116]
```

# Test source

```ts
  73  |   const text = (await page.getByRole("complementary").innerText()).replace(/\s+/g, " ");
  74  |   // £5 exactly, not £5.00: whole pounds stay whole, and the point is
  75  |   // that the figure moved from £4.50 when the campaign gained a goal.
  76  |   expect(text).toMatch(/Cost per lead £5\b/);
  77  |   expect(text).not.toMatch(/Cost per lead £4\.50/);
  78  |   await expect(page.getByText(/no goal set/i)).toHaveCount(0);
  79  |   await shoot(page, TAB, "03-goal-set", w);
  80  | });
  81  | 
  82  | test("the figures a team member enters are the figures the report shows", async ({
  83  |   page,
  84  | }, info) => {
  85  |   const w = width(info.project.name);
  86  |   await signIn(page, "elize");
  87  | 
  88  |   await page.goto(`/reporting/enter/ads?month=${MONTHS.sep}`);
  89  |   const cardText = (await page.getByRole("complementary").innerText()).replace(/\s+/g, " ");
  90  | 
  91  |   await page.goto(`/reporting/ads?month=${MONTHS.sep}`);
  92  |   const reportText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  93  |   await shoot(page, TAB, "04-report-admin", w);
  94  | 
  95  |   // §9: the live card and the report, on the same month.
  96  |   // Case-insensitive: the report's KPI labels are uppercased in CSS, and
  97  |   // innerText returns what is rendered.
  98  |   for (const [label, pattern] of [
  99  |     ["Cost per lead", /Cost per lead\s+(£[\d.,]+)/i],
  100 |     ["CPM", /CPM\s+(£[\d.,]+)/i],
  101 |     ["CTR", /CTR\s+([\d.,]+%)/i],
  102 |   ] as const) {
  103 |     const inCard = cardText.match(pattern)?.[1];
  104 |     const inReport = reportText.match(pattern)?.[1];
  105 |     expect(inCard, `${label} is not on the entry card`).toBeTruthy();
  106 |     expect(inReport, `${label} is not on the report`).toBeTruthy();
  107 |     expect(inCard, `${label}: card ${inCard}, report ${inReport}`).toBe(inReport);
  108 |   }
  109 | 
  110 |   // The totals row adds up, and reach is not summed.
  111 |   expect(reportText).toMatch(/Total\s+£600/);
  112 |   expect(reportText).toMatch(/not summed/);
  113 | });
  114 | 
  115 | test("the client sees the campaigns once it is published, and nothing of the team's", async ({
  116 |   page,
  117 | }, info) => {
  118 |   const w = width(info.project.name);
  119 | 
  120 |   await signIn(page, "nina");
  121 |   await page.goto(`/reporting?month=${MONTHS.sep}`);
  122 |   await page.getByRole("button", { name: /publish this month/i }).click();
  123 |   await expect(page.getByText(/published/i).first()).toBeVisible();
  124 | 
  125 |   await signIn(page, "client");
  126 |   await page.goto(`/reporting/ads?month=${MONTHS.sep}`);
  127 | 
  128 |   await expect(page.getByText("Lead form").first()).toBeVisible();
  129 |   await expect(page.getByText(/Cost per lead/i).first()).toBeVisible();
  130 |   await expectNothingAdminish(page);
  131 |   await shoot(page, TAB, "05-report-client", w);
  132 | });
  133 | 
  134 | test("a draft month shows the client nothing of it", async ({ page }, info) => {
  135 |   const w = width(info.project.name);
  136 |   await signIn(page, "client");
  137 | 
  138 |   // September is a draft in the seed until somebody publishes it.
  139 |   await page.goto(`/reporting/ads?month=${MONTHS.sep}`);
  140 |   await expect(page.getByText(/isn.t ready yet/i)).toBeVisible();
  141 |   await expect(page.getByText("Lead form")).toHaveCount(0);
  142 |   await expect(page.getByText(/£600/)).toHaveCount(0);
  143 |   await shoot(page, TAB, "06-client-draft", w);
  144 | });
  145 | 
  146 | test("the client cannot reach the entry screen at all", async ({ page }) => {
  147 |   await signIn(page, "client");
  148 |   await page.goto("/reporting/enter/ads");
  149 |   // Sent to the report for that category rather than shown a refusal: it
  150 |   // is not a screen they should have to think about.
  151 |   await expect(page).toHaveURL(/\/reporting\/ads/);
  152 |   await expect(page.getByRole("button", { name: /save this month/i })).toHaveCount(0);
  153 | });
  154 | 
  155 | test("the Leads tab shows the real figure from Ads, not a second box", async ({
  156 |   page,
  157 | }, info) => {
  158 |   const w = width(info.project.name);
  159 |   await signIn(page, "nina");
  160 | 
  161 |   // §4, "enter once, use everywhere": "new leads from ads" is pulled, so
  162 |   // the number on Leads must be the one the campaigns add up to — and
  163 |   // there must be nowhere to type it a second time and disagree.
  164 |   await page.goto(`/reporting/ads?month=${MONTHS.sep}`);
  165 |   const adsText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  166 |   const adsLeads = adsText.match(/Total\s+£600\s+4,200\s+([\d,]+)/)?.[1];
  167 |   expect(adsLeads, `the Ads total row did not parse: ${adsText.slice(0, 300)}`).toBe("100");
  168 | 
  169 |   await page.goto(`/reporting/leads-conversions?month=${MONTHS.sep}`);
  170 |   const leadsText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  171 |   const fromAds = leadsText.match(/New leads from ads\s+([\d,]+)/i)?.[1];
  172 | 
> 173 |   expect(fromAds, `"New leads from ads" is not on the Leads page at all`).toBeTruthy();
      |                                                                           ^ Error: "New leads from ads" is not on the Leads page at all
  174 |   expect(fromAds, `Ads says ${adsLeads}, Leads says ${fromAds}`).toBe("100");
  175 | 
  176 |   // And it is in the source split, so the total counts it.
  177 |   const total = leadsText.match(/Total leads\s+([\d,]+)/i)?.[1];
  178 |   expect(total, "Total leads is not on the page").toBeTruthy();
  179 |   expect(Number(total?.replace(",", ""))).toBeGreaterThanOrEqual(100);
  180 | 
  181 |   await shoot(page, TAB, "07-leads-from-ads", w);
  182 | 
  183 |   // Nowhere to type it: a box here would be a second answer.
  184 |   await page.goto(`/reporting/enter/leads-conversions?month=${MONTHS.sep}`);
  185 |   await expect(page.getByLabel(/new leads from ads/i)).toHaveCount(0);
  186 | });
  187 | 
```