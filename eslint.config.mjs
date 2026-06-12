// Flat ESLint config (ESLint 9) for the whole monorepo. Running `eslint .` from
// any package finds this file by walking up the tree, so one config covers
// apps/web (React + Vite), apps/api (Next route handlers), and the packages.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    // Never lint build output or generated code.
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/next-env.d.ts", // Next.js-generated; not ours to lint
      "packages/db/src/generated/**",
      "packages/db/prisma/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // tsc already enforces unused locals/params via `noUnusedLocals`; leaving
      // the lint rule on would double-report. Underscore-prefixed args are intent.
      "@typescript-eslint/no-unused-vars": "off",
      // The generated hooks force a few `as unknown as X` casts; flag real `any`.
      "@typescript-eslint/no-explicit-any": "warn",
      // TypeScript resolves identifiers and types itself; the core rule misfires.
      "no-undef": "off",
    },
  },

  {
    // Hook correctness only matters in the React app.
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // Turn off rules that conflict with Prettier — must stay last.
  prettier,
);
