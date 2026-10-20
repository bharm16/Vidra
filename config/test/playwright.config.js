import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:58175";

// Provider-free browser suite: exercises UI contracts against Vite alone, with
// API calls fulfilled by page.route. Paths are relative to this file, so the
// ../../ anchors output at the repo root, where e2e.yml uploads it.
export default defineConfig({
  testDir: "../../tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    // open: "never" stops Playwright blocking the shell on macOS.
    ["html", { outputFolder: "../../playwright-report", open: "never" }],
    ["list"],
  ],
  outputDir: "../../test-results",
  timeout: 30000,
  expect: { timeout: 5000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10000,
    navigationTimeout: 10000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 58175 --strictPort",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
