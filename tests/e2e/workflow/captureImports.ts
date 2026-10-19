import { expect, type Browser, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WorkflowGallery } from "./captureGallery";
import { authenticated } from "./helpers";

/** Real upload state journeys, including a second device with no retained File. */
export async function captureImports(page: Page, browser: Browser, gallery: WorkflowGallery): Promise<void> {
  await page.getByRole("button", { name: "Project media", exact: true }).click();
  const library = page.getByRole("main", { name: "Project Media library", exact: true });
  await expect(library.getByRole("heading", { name: "No media yet", exact: true })).toBeVisible();
  await gallery.capture(page, "media-empty-import-idle", ["X11"], "Real empty project library. The Import control opens the native file chooser directly; no empty/confirmation panel exists.");
  await page.setViewportSize({ width: 390, height: 844 });
  await gallery.capture(page, "media-empty-mobile");
  await page.setViewportSize({ width: 1440, height: 960 });
  let resume: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { resume = resolve; });
  await page.route("**/__test/upload/*", async route => { await gate; await route.continue(); });
  await library.getByLabel("Choose media file", { exact: true }).setInputFiles("tests/e2e/cross-mode/frame.png");
  await expect(page.locator('.vf-import-panel[data-state="uploading"]')).toBeVisible();
  try {
    await gallery.capture(page, "import-uploading", ["M03"], "Real import admission/upload transport held at the external upload boundary for deterministic capture. No extra confirm step.");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("button", { name: "Cancel upload", exact: true })).toBeInViewport({ ratio: 1 });
    await page.getByRole("button", { name: "Cancel upload", exact: true }).click({ trial: true });
    await gallery.capture(page, "import-uploading-mobile", ["B15"], "Same admitted upload held at its external transport boundary; native app state and panel.");
  } finally { resume?.(); }
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(library.getByRole("button", { name: "Open frame.png", exact: true })).toBeVisible();
  await page.unroute("**/__test/upload/*");
  await gallery.capture(page, "import-success-closed");
  await page.route("**/__test/upload/*", route => route.fulfill({ status: 503, body: "Controlled upload connection failure" }), { times: 1 });
  await library.getByLabel("Choose media file", { exact: true }).setInputFiles("tests/e2e/cross-mode/frame-blue.png");
  await expect(page.locator('.vf-import-panel[data-state="failed"]')).toBeVisible();
  await gallery.capture(page, "import-interrupted", ["M05"], "A real upload record remains pending after a controlled503 from its external PUT boundary.");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Retry upload", exact: true })).toBeInViewport({ ratio: 1 });
  await page.getByRole("button", { name: "Retry upload", exact: true }).click({ trial: true });
  await gallery.capture(page, "import-interrupted-mobile");
  await page.setViewportSize({ width: 1440, height: 960 });
  const libraryUrl = page.url();
  const secondDevice = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const recovery = await secondDevice.newPage();
  await authenticated(recovery);
  await recovery.goto(libraryUrl);
  await recovery.getByRole("button", { name: "Resume upload frame-blue.png", exact: true }).click();
  await expect(recovery.locator('.vf-import-panel[data-state="file-needed"]')).toBeVisible();
  await gallery.capture(recovery, "import-file-needed", [], "Same owner/project opened in a second isolated browser context. Real pending server upload exists, but this device has no File.");
  await recovery.setViewportSize({ width: 390, height: 844 });
  await expect(recovery.getByRole("button", { name: "Choose file", exact: true })).toBeInViewport({ ratio: 1 });
  await recovery.getByRole("button", { name: "Choose file", exact: true }).click({ trial: true });
  await gallery.capture(recovery, "import-file-needed-mobile");
  const layout = await recovery.evaluate(() => {
    const rectangle = (element: Element): object => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { tag: element.tagName, className: element.className, x, y, width, height };
    };
    const button = [...document.querySelectorAll("button")].find(element => element.textContent?.trim() === "Choose file");
    const bounds = button?.getBoundingClientRect();
    const hit = bounds ? document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2) : null;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      elements: Object.fromEntries([".vf-media-library", ".vf-library-mobile-top", ".vf-import-panel", "[data-radix-popper-content-wrapper]:has(.vf-import-popover)"].map(selector => [selector, [...document.querySelectorAll(selector)].map(rectangle)])),
      chooseFile: button ? rectangle(button) : null,
      hit: hit ? rectangle(hit) : null,
      hitButtonText: hit?.closest("button")?.textContent?.trim(),
    };
  });
  await writeFile(join(gallery.root, "file-needed-mobile-dom.json"), JSON.stringify(layout, null, 2));
  await secondDevice.close();
  await page.getByRole("button", { name: "Retry upload", exact: true }).click();
  await expect(library.getByRole("button", { name: "Open frame-blue.png", exact: true })).toBeVisible();
  await library.getByLabel("Choose media file", { exact: true }).setInputFiles({ name: "unreadable.png", mimeType: "image/png", buffer: Buffer.from("Unreadable bytes, deliberately not a picture") });
  await expect(page.locator('.vf-import-panel[data-state="unsupported"]')).toBeVisible();
  await gallery.capture(page, "import-unsupported", [], "An unreadable declared PNG is rejected by actual file-type/content verification; no media version is published.");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Choose another file", exact: true })).toBeInViewport({ ratio: 1 });
  await page.getByRole("button", { name: "Choose another file", exact: true }).click({ trial: true });
  await gallery.capture(page, "import-unsupported-mobile");
  await page.setViewportSize({ width: 1440, height: 960 });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose another file", exact: true }).click();
  await (await chooser).setFiles("tests/e2e/cross-mode/frame.png");
  await expect(page.locator('.vf-import-panel[data-state="unsupported"]')).toHaveCount(0);
  await expect(page.locator('.vf-import-panel[data-state="uploading"]')).toHaveCount(0);
  await library.getByRole("button", { name: "Open frame-blue.png", exact: true }).click();
  await expect(page.getByLabel("Current request words", { exact: true })).toBeVisible();
}
