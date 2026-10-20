// Fail fast with a clear message if a stale Node (pre-17) is on PATH. ESLint
// 9 and @eslint/config-array rely on `structuredClone` (global in Node 17+);
// without this check, an external pre-push hook that resolves to an old
// /usr/local/bin/node hits a cryptic "structuredClone is not defined" deep
// inside the config merger instead of a pointer to the real problem.
const [nodeMajor] = process.versions.node.split(".").map(Number);
if (nodeMajor < 20) {
  throw new Error(
    `ESLint config requires Node >=20; found ${process.versions.node} at ` +
      `${process.execPath}. Check which node resolves in your shell — an old ` +
      `/usr/local/bin/node (Intel Homebrew) may be ahead of /opt/homebrew/bin ` +
      `on PATH. See .nvmrc.`,
  );
}

import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tsParser from "@typescript-eslint/parser";
import tsEslint from "@typescript-eslint/eslint-plugin";

// Every rule is an error or off. A warning blocks nothing, so nobody acts on it.
export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/.vite/**",
      "**/.cache/**",
      "**/tmp/**",
      // Local design-tool scripts and verification artifacts are not application modules.
      ".scratch/**",
      // Parallel-agent worktrees checked out INSIDE the repo — foreign
      // sessions' files; linting them breaks every pre-commit run here.
      ".claude/worktrees/**",
      // Design-tool reference bundles (visual specs, not code)
      "docs/design/handoff/returns/**",
      "design_handoff_vidra/**",
    ],
  },
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    settings: { react: { version: "18.3" } },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      "react-hooks/exhaustive-deps": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "react/jsx-no-target-blank": "off",
      "react/prop-types": "off",
      "react/display-name": "off",
      "no-useless-escape": "off",
      "no-prototype-builtins": "off",
      "no-useless-catch": "off",
      "no-unused-vars": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tsEslint,
    },
    rules: {
      "no-undef": "off",
    },
  },
  // Test files configuration
  {
    files: [
      "**/__tests__/**/*.{js,jsx,ts,tsx}",
      "**/*.{test,spec}.{js,jsx,ts,tsx}",
      "tests/**/*.{js,jsx,ts,tsx}",
      "config/test/vitest.setup.client.js",
      "config/test/vitest.setup.server.js",
      "config/test/vitest.config.js",
      "config/test/playwright.config.js",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        vi: "readonly",
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        global: "readonly",
      },
    },
  },
];
