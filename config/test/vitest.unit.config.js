import { availableParallelism } from "node:os";
import { defineConfig, mergeConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import baseConfig from "./vitest.config.js";

const clamp = (min, max, value) => Math.min(max, Math.max(min, value));

const cpuCount =
  typeof availableParallelism === "function" ? availableParallelism() : 4;

const serverMaxThreads = clamp(1, 8, cpuCount - 1);

// Keep jsdom suites below high parallelism: too many client forks has been causing
// timeout flakes in interaction-heavy tests under full-suite load.
const clientMaxForks = clamp(1, 2, Math.floor(cpuCount / 2));

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: "server",
            environment: "node",
            pool: "threads",
            poolOptions: {
              threads: { isolate: true, minThreads: 1, maxThreads: serverMaxThreads },
            },
            setupFiles: ["./config/test/vitest.setup.server.js"],
            include: [
              "server/src/**/*.{test,spec}.{ts,js}",
              "shared/**/*.{test,spec}.{ts,js}",
              "packages/**/tests/**/*.{test,spec}.{ts,js}",
              "tests/unit/**/*.{test,spec}.ts",
              // One glob instead of enumerated directories: a new
              // scripts/**/__tests__ dir must not be silently unrun.
              "scripts/**/__tests__/**/*.{test,spec}.{ts,js}",
            ],
          },
        },
        {
          extends: true,
          plugins: [react()],
          test: {
            name: "client",
            environment: "jsdom",
            pool: "forks",
            poolOptions: {
              forks: {
                isolate: true,
                minForks: 1,
                maxForks: clientMaxForks,
              },
            },
            setupFiles: ["./config/test/vitest.setup.client.js"],
            include: [
              "client/src/**/*.{test,spec}.{ts,tsx,js,jsx}",
              "packages/**/tests/**/*.{test,spec}.{tsx,jsx}",
              "tests/unit/**/*.{test,spec}.{tsx,jsx}",
            ],
            // A jsdom interaction test that takes ~1-3s on an idle machine takes
            // well past the 10s base budget while the server project saturates
            // the remaining cores, so the full suite failed a shifting handful of
            // tests every run while each one passed in isolation. Headroom, not
            // the base budget, is what these tests need: a timeout only costs
            // wall-clock on a test that was going to fail anyway.
            testTimeout: 30000,
            // Projects run in parallel by default, which put 2 jsdom forks
            // against 8 server threads on a 10-core machine. Starved that hard,
            // a 350ms menu interaction took over 30s — userEvent awaits a
            // macrotask per synthetic event, so event-loop latency multiplies
            // across the dozens of events one interaction fires. A later group
            // runs after the server project instead of alongside it.
            sequence: { groupOrder: 1 },
          },
        },
      ],
    },
  }),
);
