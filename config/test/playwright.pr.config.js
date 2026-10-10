import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import baseConfig from "./playwright.config.js";

const baseURL = "http://127.0.0.1:58175";
const reportDirectory = fileURLToPath(
  new URL("../../playwright-report/pr-ui/", import.meta.url),
);
const browser = {
  ...devices["Desktop Chrome"],
  ...(process.env.E2E_CHROME_CHANNEL
    ? { channel: process.env.E2E_CHROME_CHANNEL }
    : {}),
};

// PR feedback exercises existing UI contracts without starting the API or
// exposing provider credentials. Native golden-path coverage has its own job.
export default defineConfig({
  ...baseConfig,
  retries: 0,
  reporter: [
    ["html", { outputFolder: reportDirectory, open: "never" }],
    ["json", { outputFile: `${reportDirectory}results.json` }],
    ["junit", { outputFile: `${reportDirectory}results.xml` }],
    ["list"],
  ],
  outputDir: fileURLToPath(
    new URL("../../test-results/pr-ui/", import.meta.url),
  ),
  use: {
    ...baseConfig.use,
    baseURL,
    trace: "retain-on-failure",
    // Installed Chrome can be used locally without Playwright's recorder.
    // CI retains video with the bundled browser/recorder container.
    ...(process.env.E2E_CHROME_CHANNEL ? { video: "off" } : {}),
  },
  projects: [
    {
      name: "chromium-ui",
      testMatch: [
        "auth-pages.spec.ts",
        "marketing-pages.spec.ts",
        "navigation.spec.ts",
        "history-page.spec.ts",
        "share-page.spec.ts",
      ],
      use: browser,
    },
    {
      name: "chromium-guest",
      testMatch: "golden-path.spec.ts",
      grep: /a guest submit is sign-in-gated and preserves the prompt$/,
      use: browser,
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 58175 --strictPort",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
