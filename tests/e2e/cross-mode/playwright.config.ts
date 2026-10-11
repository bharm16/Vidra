import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { parseBrowserAddress, reserveBrowserAddress } from "./browserAddress";

process.env.CROSS_MODE_BROWSER_PROOF = "1";
const reserved = process.env.CROSS_MODE_BROWSER_URL ? undefined : await reserveBrowserAddress();
const address = parseBrowserAddress(process.env.CROSS_MODE_BROWSER_URL ?? reserved?.origin ?? "");
await reserved?.release();
process.env.CROSS_MODE_BROWSER_URL = address.origin;

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
    baseURL: address.origin,
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
    url: `${address.origin}/__test/state`,
    env: { CROSS_MODE_BROWSER_URL: address.origin },
    cwd: fileURLToPath(new URL("../../../", import.meta.url)),
    timeout: 90_000,
    reuseExistingServer: false,
  },
});
