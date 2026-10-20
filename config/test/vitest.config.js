import { defineConfig } from "vitest/config";
import path from "path";

const rootDir = path.resolve(__dirname, "../../");

const aliases = [
  {
    find: /^@config\/performance\.config$/,
    replacement: path.resolve(
      __dirname,
      "../../client/src/config/performance.config",
    ),
  },

  {
    find: /^#tests\/(.*)/,
    replacement: path.resolve(__dirname, "../../tests/$1"),
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
  "tests/integration/**",
  "docs/**",
  "**/.{idea,git,cache,output,temp}/**",
  // Stale agent working copies under .claude/worktrees/agent-*/ have
  // root-relative path aliases that don't resolve from their subdirectories,
  // causing spurious test-file load failures. Exclude them from all runs.
  "**/.claude/worktrees/**",
  "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
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
    testTimeout: 10000,
  },
});
