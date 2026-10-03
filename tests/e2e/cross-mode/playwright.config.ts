import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

process.env.CROSS_MODE_BROWSER_PROOF = "1";

export default defineConfig({
  testDir: "..",
  testMatch: "cross-mode.spec.ts",
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  outputDir:
    process.env.CROSS_MODE_TEST_OUTPUT ?? "../../../test-results/cross-mode",
  use: {
    baseURL: "http://127.0.0.1:58141",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.E2E_CHROME_CHANNEL
          ? { channel: process.env.E2E_CHROME_CHANNEL }
          : {}),
      },
    },
  ],
  webServer: {
    command: "npx tsx --tsconfig tsconfig.json tests/e2e/cross-mode/serve.ts",
    url: "http://127.0.0.1:58141/__test/state",
    cwd: fileURLToPath(new URL("../../../", import.meta.url)),
    timeout: 90_000,
    reuseExistingServer: false,
  },
});
