import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { parseBrowserAddress, reserveBrowserAddress } from "../cross-mode/browserAddress";

const reserved = process.env.CROSS_MODE_BROWSER_URL ? undefined : await reserveBrowserAddress();
const address = parseBrowserAddress(process.env.CROSS_MODE_BROWSER_URL ?? reserved?.origin ?? "");
await reserved?.release();
process.env.CROSS_MODE_BROWSER_URL = address.origin;
export default defineConfig({
  testDir: ".", testMatch: process.env.WORKFLOW_CAPTURE === "1" ? ["*.spec.ts", "gallery.capture.ts", "inline-editor.capture.ts"] : "*.spec.ts", workers: 1, timeout: 90000,
  expect: { timeout: 10000 }, reporter: "list",
  outputDir: process.env.WORKFLOW_TEST_OUTPUT ?? "../../../test-results/workflow",
  use: { baseURL: address.origin, channel: "chrome", viewport: { width: 1440, height: 900 }, screenshot: "only-on-failure", trace: "retain-on-failure", actionTimeout: 10000 },
  webServer: { command: "npx tsx --tsconfig tsconfig.json tests/e2e/workflow/serve.ts", url: `${address.origin}/__test/state`, env: { CROSS_MODE_BROWSER_URL: address.origin }, cwd: fileURLToPath(new URL("../../../", import.meta.url)), timeout: 90000, reuseExistingServer: false },
});
