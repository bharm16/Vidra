import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E Testing Configuration
 * @see https://playwright.dev/docs/test-configuration
 */
// Single-browser (chromium) is the default for fast feedback.
// Cross-browser coverage is opted into via E2E_ALL_BROWSERS=true — set on
// pushes to main/develop and on the nightly schedule, but not on PR runs.
const singleBrowser = process.env.E2E_ALL_BROWSERS !== "true";

export default defineConfig({
  testDir: "../../tests/e2e",

  // Test execution settings
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // workers: 1 was leaving CPU on the table — multiple test files can run
  // in parallel even when fullyParallel is on, since each worker still
  // owns one browser context. 2 keeps memory predictable on the runner.
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    // open: "never" — stops Playwright from running `open --wait-apps`
    // on the report URL, which blocks the parent shell on macOS until
    // someone closes the browser tab. We always have the JSON report.
    //
    // Paths are relative to THIS file's directory (config/test/), so the
    // ../../ anchors output at the repo root — where .gitignore and the CI
    // upload-artifact steps (e2e.yml, golden-path.yml) expect it. When the
    // config moved into config/test/ the bare paths silently started
    // writing here instead, and every CI failure shipped zero artifacts.
    ["html", { outputFolder: "../../playwright-report", open: "never" }],
    ["json", { outputFile: "../../playwright-report/results.json" }],
    ["junit", { outputFile: "../../playwright-report/results.xml" }],
    ["list"],
  ],

  // Traces/videos/screenshots — same root-anchoring as the reporters.
  outputDir: "../../test-results",

  // Test timeout settings
  timeout: 30000,
  expect: {
    timeout: 5000,
  },

  use: {
    // Base URL for navigation
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",

    // Collect trace on failure for debugging
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",

    // Browser viewport
    viewport: { width: 1280, height: 720 },

    // Action settings
    actionTimeout: 10000,
    navigationTimeout: 10000,
  },

  // Test projects for different browsers
  projects: singleBrowser
    ? [
        {
          name: "chromium",
          use: { ...devices["Desktop Chrome"] },
        },
      ]
    : [
        {
          name: "chromium",
          use: { ...devices["Desktop Chrome"] },
        },
        {
          name: "firefox",
          use: { ...devices["Desktop Firefox"] },
        },
        {
          name: "webkit",
          use: { ...devices["Desktop Safari"] },
        },
        // Mobile testing
        {
          name: "Mobile Chrome",
          use: { ...devices["Pixel 5"] },
        },
        {
          name: "Mobile Safari",
          use: { ...devices["iPhone 12"] },
        },
      ],

  // Web server configuration - automatically start dev server
  webServer: {
    command: "npm run start",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
