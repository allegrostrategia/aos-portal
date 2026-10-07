/**
 * Let a plain Node script import the app's own modules.
 *
 * Two things Node does not know: the `@/*` alias from tsconfig, and the
 * extensions TypeScript lets an import leave off. Plus `server-only`,
 * which exists to make a build fail if a server module reaches the client
 * and has nothing to do in a script.
 *
 * The same resolution as `supabase/tests/hooks.mjs`, **without its
 * substitutes**: a script wants the real Supabase clients, not the
 * PGlite shims. Kept separate rather than parameterised, because a flag
 * that switches a test harness between fake and real databases is a flag
 * somebody will one day get the wrong way round.
 *
 * Import this before any dynamic import of app code — static imports are
 * evaluated in order, which is what makes that reliable.
 */
import { registerHooks } from "node:module";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = path.join(import.meta.dirname, "..", "src");
const NOOP = pathToFileURL(path.join(import.meta.dirname, "noop-module.mjs")).href;

function resolveFile(base) {
  return [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find((c) =>
    existsSync(c),
  );
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: NOOP, shortCircuit: true };

    if (specifier.startsWith("@/")) {
      const found = resolveFile(path.join(SRC, specifier.slice(2)));
      if (!found) throw new Error(`Cannot resolve ${specifier}`);
      return { url: pathToFileURL(found).href, shortCircuit: true };
    }

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
