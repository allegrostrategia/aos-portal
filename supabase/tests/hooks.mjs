/**
 * Module resolution for tests that drive the app's own Server Actions.
 *
 * Importing this registers the hooks, so it has to come before any dynamic
 * import of the code under test — static imports are evaluated in order, which
 * is what makes that reliable.
 *
 * Three jobs:
 *   · substitute the modules that can't run outside Next — `server-only`,
 *     next/cache, next/navigation — and the two Supabase clients, which become
 *     PGlite-backed shims
 *   · resolve the `@/*` alias from tsconfig, which Node knows nothing about
 *   · supply the file extensions TypeScript lets you leave off and Node insists
 *     on, for aliased and relative specifiers alike
 *
 * That last one matters more than it looks: without it a test fails to load
 * whenever a module under test imports a sibling, and the tempting fix is to add
 * `.ts` throughout the app to suit the harness. The harness should bend.
 */
import { registerHooks } from "node:module";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "..", "..", "src");
const stub = (file) => pathToFileURL(path.join(HERE, "stubs", file)).href;

const SUBSTITUTES = new Map([
  ["server-only", stub("server-only.mjs")],
  ["next/cache", stub("next-cache.mjs")],
  ["next/navigation", stub("next-navigation.mjs")],
  ["@/lib/supabase/server", stub("supabase-server.mjs")],
  ["@/lib/supabase/admin", stub("supabase-admin.mjs")],
  ["@/lib/email/send", stub("email-send.mjs")],
]);

/** The first of these that exists on disk. */
function resolveFile(base) {
  return [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find(
    (candidate) => existsSync(candidate) && !existsSync(path.join(candidate, ".")) === false,
  );
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const substitute = SUBSTITUTES.get(specifier);
    if (substitute) return { url: substitute, shortCircuit: true };

    if (specifier.startsWith("@/")) {
      const found = resolveFile(path.join(SRC, specifier.slice(2)));
      if (!found) throw new Error(`Test hook cannot resolve ${specifier}`);
      return { url: pathToFileURL(found).href, shortCircuit: true };
    }

    // A sibling import inside src, written without an extension.
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const parent = fileURLToPath(context.parentURL);
      if (parent.startsWith(SRC) && !path.extname(specifier)) {
        const found = resolveFile(path.resolve(path.dirname(parent), specifier));
        if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
      }
    }

    return nextResolve(specifier, context);
  },
});
