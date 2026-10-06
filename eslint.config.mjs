import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // The browser tests build here, so the dev server they drive can run
    // beside the one on 3000 (Next 16 locks a build directory).
    ".next-e2e/**",
    // And the second one, which runs the same app at the production
    // stage so the gate can be watched holding. It went into
    // .gitignore when it was added and not into here, so `npm run
    // lint` has been reporting 707 errors in built output since.
    ".next-e2e-stage2/**",
    "e2e/report/**",
    "test-results/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
