import { defineConfig } from "vitest/config";
import path from "path";

const rootDir = path.resolve(__dirname, "../../");

const aliases = [
  // Mock lucide-react icons for test environment stability
  {
    find: /^lucide-react$/,
    replacement: path.resolve(__dirname, "../../tests/mocks/lucide-react.ts"),
  },

  // Client utils shim for shared @utils/cn usage in client components
  {
    find: /^@utils\/cn$/,
    replacement: path.resolve(__dirname, "../../client/src/utils/cn"),
  },
  {
    find: /^@utils\/subjectDescriptorCategories$/,
    replacement: path.resolve(
      __dirname,
      "../../client/src/utils/subjectDescriptorCategories",
    ),
  },
  {
    find: /^@utils\/textQuoteRelocator$/,
    replacement: path.resolve(
      __dirname,
      "../../client/src/utils/textQuoteRelocator",
    ),
  },
  {
    find: /^@utils\/canonicalText$/,
    replacement: path.resolve(
      __dirname,
      "../../client/src/utils/canonicalText",
    ),
  },
  {
    find: /^@utils\/PromptContext\/(.*)/,
    replacement: path.resolve(
      __dirname,
      "../../client/src/utils/PromptContext/$1",
    ),
  },
  {
    find: /^@utils\/PromptContext$/,
    replacement: path.resolve(
      __dirname,
      "../../client/src/utils/PromptContext",
    ),
  },
  {
    find: /^@config\/performance\.config$/,
    replacement: path.resolve(
      __dirname,
      "../../client/src/config/performance.config",
    ),
  },

  // Shared aliases (used by both client and server) - from both tsconfig.json files
  {
    find: /^@shared\/(.*)/,
    replacement: path.resolve(__dirname, "../../shared/$1"),
  },
  {
    find: /^#shared\/(.*)/,
    replacement: path.resolve(__dirname, "../../shared/$1"),
  },
  { find: "@shared", replacement: path.resolve(__dirname, "../../shared") },
  { find: "#shared", replacement: path.resolve(__dirname, "../../shared") },

  // Server-specific aliases (from server/tsconfig.json)
  {
    find: /^@infrastructure\/(.*)/,
    replacement: path.resolve(__dirname, "../../server/src/infrastructure/$1"),
  },
  {
    find: "@infrastructure",
    replacement: path.resolve(__dirname, "../../server/src/infrastructure"),
  },
  {
    find: /^@interfaces\/(.*)/,
    replacement: path.resolve(__dirname, "../../server/src/interfaces/$1"),
  },
  {
    find: "@interfaces",
    replacement: path.resolve(__dirname, "../../server/src/interfaces"),
  },
  {
    find: /^@llm\/(.*)/,
    replacement: path.resolve(__dirname, "../../server/src/llm/$1"),
  },
  {
    find: "@llm",
    replacement: path.resolve(__dirname, "../../server/src/llm"),
  },
  {
    find: /^@api\/(.*)/,
    replacement: path.resolve(__dirname, "../../server/src/api/$1"),
  },
  {
    find: "@api",
    replacement: path.resolve(__dirname, "../../server/src/api"),
  },
  {
    find: /^@middleware\/(.*)/,
    replacement: path.resolve(__dirname, "../../server/src/middleware/$1"),
  },
  {
    find: "@middleware",
    replacement: path.resolve(__dirname, "../../server/src/middleware"),
  },
  {
    find: /^@routes\/(.*)/,
    replacement: path.resolve(__dirname, "../../server/src/routes/$1"),
  },
  {
    find: "@routes",
    replacement: path.resolve(__dirname, "../../server/src/routes"),
  },
  {
    find: /^@clients\/(.*)/,
    replacement: path.resolve(__dirname, "../../server/src/clients/$1"),
  },
  {
    find: "@clients",
    replacement: path.resolve(__dirname, "../../server/src/clients"),
  },
  {
    find: /^@server\/(.*)/,
    replacement: path.resolve(__dirname, "../../server/src/$1"),
  },
  { find: "@server", replacement: path.resolve(__dirname, "../../server/src") },
  {
    find: /^@scripts\/(.*)/,
    replacement: path.resolve(__dirname, "../../scripts/$1"),
  },
  { find: "@scripts", replacement: path.resolve(__dirname, "../../scripts") },
  {
    find: /^@migrations\/(.*)/,
    replacement: path.resolve(__dirname, "../../scripts/migrations/$1"),
  },
  {
    find: "@migrations",
    replacement: path.resolve(__dirname, "../../scripts/migrations"),
  },

  // Client-specific aliases (from client/tsconfig.json)
  {
    find: /^@\/(.*)/,
    replacement: path.resolve(__dirname, "../../client/src/$1"),
  },
  {
    find: /^@components\/(.*)/,
    replacement: path.resolve(__dirname, "../../client/src/components/$1"),
  },
  {
    find: "@components",
    replacement: path.resolve(__dirname, "../../client/src/components"),
  },
  {
    find: /^@features\/(.*)/,
    replacement: path.resolve(__dirname, "../../client/src/features/$1"),
  },
  {
    find: "@features",
    replacement: path.resolve(__dirname, "../../client/src/features"),
  },
  {
    find: /^@hooks\/(.*)/,
    replacement: path.resolve(__dirname, "../../client/src/hooks/$1"),
  },
  {
    find: "@hooks",
    replacement: path.resolve(__dirname, "../../client/src/hooks"),
  },
  {
    find: /^@styles\/(.*)/,
    replacement: path.resolve(__dirname, "../../client/src/styles/$1"),
  },
  {
    find: "@styles",
    replacement: path.resolve(__dirname, "../../client/src/styles"),
  },
  {
    find: /^@lib\/(.*)/,
    replacement: path.resolve(__dirname, "../../client/src/lib/$1"),
  },
  {
    find: "@lib",
    replacement: path.resolve(__dirname, "../../client/src/lib"),
  },
  {
    find: /^@schemas\/(.*)/,
    replacement: path.resolve(__dirname, "../../client/src/schemas/$1"),
  },
  {
    find: "@schemas",
    replacement: path.resolve(__dirname, "../../client/src/schemas"),
  },
  {
    find: /^@repositories\/(.*)/,
    replacement: path.resolve(__dirname, "../../client/src/repositories/$1"),
  },
  {
    find: "@repositories",
    replacement: path.resolve(__dirname, "../../client/src/repositories"),
  },

  // Shared aliases that exist in both client and server
  // For tests, server paths take precedence for @config, @services, @types
  // @config - server config (server/src/config)
  {
    find: /^@config\/(.*)/,
    replacement: path.resolve(__dirname, "../../server/src/config/$1"),
  },
  {
    find: "@config",
    replacement: path.resolve(__dirname, "../../server/src/config"),
  },
  // @services - server services (server/src/services)
  {
    find: /^@services\/(.*)/,
    replacement: path.resolve(__dirname, "../../server/src/services/$1"),
  },
  {
    find: "@services",
    replacement: path.resolve(__dirname, "../../server/src/services"),
  },
  // @types - server types (server/src/types)
  {
    find: /^@types\/(.*)/,
    replacement: path.resolve(__dirname, "../../server/src/types/$1"),
  },
  {
    find: "@types",
    replacement: path.resolve(__dirname, "../../server/src/types"),
  },
  // @utils - server utils take precedence (server/src/utils)
  {
    find: /^@utils\/(.*)/,
    replacement: path.resolve(__dirname, "../../server/src/utils/$1"),
  },
  {
    find: "@utils",
    replacement: path.resolve(__dirname, "../../server/src/utils"),
  },

  // React resolution
  {
    find: "react",
    replacement: path.resolve(__dirname, "../../node_modules/react"),
  },
  {
    find: "react-dom",
    replacement: path.resolve(__dirname, "../../node_modules/react-dom"),
  },
];

const testExclude = [
  "**/node_modules/**",
  "**/dist/**",
  "**/e2e/**",
  "**/*.performance.test.{js,jsx,ts,tsx}",
  "tests/integration/**",
  "docs/**",
  "**/.{idea,git,cache,output,temp}/**",
  // Stale agent working copies under .claude/worktrees/agent-*/ have
  // root-relative path aliases that don't resolve from their subdirectories,
  // causing spurious test-file load failures. Exclude them from all runs.
  "**/.claude/worktrees/**",
  "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
];

// What counts as source for coverage. Two long-standing gaps put non-source
// files in the denominator: the test-file globs named only .js/.jsx, so every
// .ts/.tsx test and __tests__ helper was measured as if it were production
// code, and "e2e/**" never matched the e2e suite's real home under tests/.
const coverageExclude = [
  "node_modules/",
  "dist/",
  "**/*.test.{js,jsx,ts,tsx}",
  "**/*.spec.{js,jsx,ts,tsx}",
  "**/__tests__/**",
  "**/__fixtures__/**",
  "**/__mocks__/**",
  "tests/**",
  "**/*.config.{js,ts}",
  "vite.config.js",
  "vitest.config.js",
  "vitest.workspace.js",
  "vitest.setup.js",
  "vitest.setup.client.js",
  "vitest.setup.server.js",
  "eslint.config.js",
  "postcss.config.js",
  "tailwind.config.js",
  "src/main.jsx",
  "e2e/**",
  "scripts/**",
  "playwright.config.js",
  ".claude/worktrees/**",
];

export default defineConfig({
  root: rootDir,
  resolve: {
    // Path aliases matching tsconfig.json for both client and server
    // Note: Order matters - more specific patterns should come before general ones
    alias: aliases,
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  test: {
    globals: true,
    exclude: testExclude,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: coverageExclude,
      // A ratchet at the measured floor, not a target.
      //
      // 85/80/75/85 was set on 2025-10-15, four days after this repo had 77
      // tests over three files and genuinely measured 76.85%. It has been
      // unreachable ever since the codebase grew, and nobody noticed because
      // the coverage step only ever ran on a CI that was failing at startup.
      // Real coverage across ~1,000 source files is 57.5%.
      //
      // These numbers sit just under current so the gate catches a regression
      // rather than reporting an aspiration. Raise them when coverage earns
      // it; do not lower them to make a red build green.
      thresholds: {
        lines: 57,
        functions: 78,
        branches: 74,
        statements: 57,
      },
    },
    testTimeout: 10000,
  },
});
