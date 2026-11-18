import { expect, test as base, type Page } from "@playwright/test";

/**
 * Every browser test, with the console watched.
 *
 * **Why this exists.** On 18 November the LinkedIn report screenshot came
 * back with Next's dev badge reading "1 Issue", and the only way to find
 * out what it was, was to open a browser by hand and read the console.
 * What that one turned out to be is benign — see `IGNORED` below — but
 * the sweep that found it also found a real error on the print page:
 * duplicate React keys in the Wins and Focus lists, on the PDF a client
 * is sent, where React is free to omit or duplicate a row. Three hundred
 * and seventy-eight browser tests had been passing over it all month,
 * because none of them was looking.
 *
 * So: a console error fails the test that was on screen when it
 * happened. An auto fixture rather than a line in each spec, because the
 * specs that most need this are the ones nobody thought to add it to.
 *
 * **Errors only, never warnings.** A warning is advice — Next's LCP
 * hint below is advice the project has already considered and declined —
 * and a suite that fails on advice gets switched off. An error is the
 * browser saying something did not work.
 */

/**
 * Noise that is not a defect, each with the reason it is here. Anything
 * not in this list fails.
 */
const IGNORED: { pattern: RegExp; why: string }[] = [
  {
    // Next's dev overlay counts this as an "issue", which is what the
    // badge on the LinkedIn screenshot was. The header photograph is
    // `hidden sm:block` and deliberately NOT `priority`: priority
    // preloads, and it would send a photograph to every phone that is
    // never going to draw one. `mockup-screens.spec.ts` asserts the
    // phone does not fetch it. Dev-only; it is not in a built page.
    pattern: /Largest Contentful Paint \(LCP\)/,
    why: "Next dev advice on a trade-off the project made on purpose",
  },
  {
    // The dev server's own hot-reload socket, when a test closes the
    // page mid-connection. Nothing to do with the page under test.
    pattern: /WebSocket connection to 'ws:\/\/127\.0\.0\.1:\d+\/_next\/webpack-hmr'/,
    why: "the dev server's reload socket, closed with the page",
  },
  {
    /**
     * Next's own render timing, on a navigation whose page never
     * rendered — every one seen so far was a route that 404s on
     * purpose, where the start mark is taken and the end mark never
     * is. **Nothing in this project calls `performance.measure`**
     * (`grep` says so), and the names it is complaining about are our
     * component names because Next's dev instrumentation uses them, so
     * an error from this API can only be the framework's. Dev-only: the
     * instrumentation is not in a built page.
     *
     * It appeared on one full run and not the one before it, on the
     * same code — a race in that instrumentation, not something a test
     * can be written against.
     */
    pattern: /Failed to execute 'measure' on 'Performance'/,
    why: "Next's dev render timing on a page that never rendered",
  },
];

/** Tests that make the browser complain on purpose, and say so. */
const permitted = new WeakMap<Page, RegExp>();

/**
 * "This test is expected to log THIS error, and here is why."
 *
 * For a spec that makes the browser complain on purpose — a route that
 * must 404, a request it induces to fail. It takes a reason because a
 * silent opt-out is how a guard stops guarding, and a pattern because a
 * test that is allowed to log one thing should not thereby be allowed
 * to log everything.
 */
export function expectsConsoleErrors(page: Page, why: string, what: RegExp) {
  if (!why) throw new Error("expectsConsoleErrors needs a reason");
  permitted.set(page, what);
}

/** The one every "this route does not exist" test needs. */
export const A_MISSING_PAGE = /Failed to load resource: .*404 \(Not Found\)/;

export interface ConsoleNote {
  url: string;
  text: string;
}

export const test = base.extend<{ console: ConsoleNote[] }>({
  console: [
    async ({ page }, use, testInfo) => {
      const seen: ConsoleNote[] = [];
      const note = (text: string) => {
        if (IGNORED.some((i) => i.pattern.test(text))) return;
        if (permitted.get(page)?.test(text)) return;
        // The URL as it is NOW, which is where the error was raised:
        // by teardown the test has usually navigated on.
        seen.push({ url: page.url(), text });
      };

      page.on("console", (m) => {
        if (m.type() === "error") note(m.text());
      });
      page.on("pageerror", (e) => note(`${e.name}: ${e.message}`));

      await use(seen);

      // Not on a test that has already failed: the first failure is the
      // one worth reading, and a broken page logs plenty afterwards.
      if (testInfo.status !== "passed") return;
      expect(
        seen.map((s) => `${s.url}\n    ${s.text}`),
        "the browser console, during this test",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
