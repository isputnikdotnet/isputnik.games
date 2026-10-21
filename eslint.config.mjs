// Lint for every workspace: `npm run lint`, and CI runs it beside typecheck.
// tsc --strict does the heavy lifting; this catches what the compiler can't —
// dead variables, misused hooks, stray `any`. Same rule set as isputnik.home so a
// file moved between the two projects lints the same way.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { linterOptions: { reportUnusedDisableDirectives: "error" } },
  {
    ignores: ["**/dist/**", "**/node_modules/**", "apps/web/public/**", "data/**", "coverage/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrors: "none",
        ignoreRestSiblings: true
      }],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-useless-assignment": "off",
      "no-useless-escape": "warn"
    }
  },
  {
    files: ["apps/server/**/*.ts", "packages/**/*.ts", "scripts/**/*.{js,mjs}", "*.{js,mjs}", "apps/*/*.config.ts", "packages/*/*.config.ts"],
    languageOptions: { globals: globals.node }
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}", "apps/web/test/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: globals.browser },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/use-memo": "error",
      "react-hooks/static-components": "error",
      "react-hooks/immutability": "error",
      "react-hooks/purity": "error",
      "react-hooks/preserve-manual-memoization": "error",
      "react-hooks/refs": "error"
    }
  }
);
