# Screen sweep — 13 November 2026

Every screen in the reporting tool, at both widths, in the order
somebody uses it: enter a month, then read the report of it.

- `01`–`09` the entry screens, in tab order
- `10` Launches, which has its own screens rather than a month of fields
- `11`–`20` the report, Overview first
- `21` the month as a document, which is what the PDF prints

**Regenerate with `npx playwright test e2e/screen-sweep.spec.ts`.** The
spec fills a month first — the four Financials grids through the screens,
and Social Media, Email and Offers straight into the database, because
those screens have their own tests and thirty fields typed through a
browser is thirty chances for this to fail for a reason that has nothing
to do with what it is showing.

The figures are a fixture, not a real client: Northwind Studio is the
seed's test workspace. Nothing in this folder comes from anybody's real
data.
