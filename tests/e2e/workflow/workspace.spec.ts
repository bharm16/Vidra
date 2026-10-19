import { test, expect } from "@playwright/test";
import { authenticated, conversations, guard, keepWords, library, makePicture, project, versions } from "./helpers";

test.beforeEach(async ({ page }) => { await authenticated(page); });
test("signed in, /app opens a composer without a project, and a new project is a place to file work", async ({ page }) => {
  await page.goto("/app");
  const words = page.getByLabel("Current request words", { exact: true });
  await expect(words).toBeVisible();
  await expect(page).toHaveURL(/\/app$/);
  const home = await library(page);
  await expect.poll(async () => (await conversations(page, home.id)).some(row => row.status === "active" && row.acceptanceSequence === 0)).toBe(true);
  await page.goto("/app/projects");
  const name = `Filed ${crypto.randomUUID()}`;
  await page.getByRole("button", { name: "New project", exact: true }).first().click();
  await page.getByLabel("Project name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await page.waitForURL(/\/app\?folder=folder_/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(words).toBeVisible();
  const folderId = new URL(page.url()).searchParams.get("folder");
  await expect.poll(async () => (await conversations(page, home.id)).some(row => row.folderId === folderId && row.acceptanceSequence === 0)).toBe(true);
  await guard(page);
});

test("saved words survive reload, chip selection and direct Make produces owned reloadable media", async ({ page }) => {
  await project(page);
  const words = "A runner passes through warm stadium lights. Keep the current work.";
  await keepWords(page, words);
  const url = page.url();
  await page.reload();
  await expect(page.getByLabel("Current request words", { exact: true })).toHaveValue(words);
  await page.getByRole("button", { name: "Shape: 16:9", exact: true }).click();
  await page.getByRole("button", { name: "1:1", exact: true }).click();
  await expect(page.getByRole("button", { name: "Shape: 1:1", exact: true })).toBeVisible();
  await expect(page.getByLabel("Current request words", { exact: true })).toHaveValue(words);
  await makePicture(page, words);
  await expect(page.getByRole("button", { name: `View ${words}`, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: `View ${words}`, exact: true })).toBeVisible();
  expect(await versions(page)).toHaveLength(1);
  await expect(page).toHaveURL(url);
  await guard(page);
});
test("a failed history load is actionable and does not erase a retained draft", async ({ page }) => {
  await project(page);
  await keepWords(page, "Retain this before observing older work");
  await page.route("**/conversations/*/requests", route => route.fulfill({ status: 503, json: { success: false, error: "History is unavailable" } }));
  await page.reload();
  await expect(page.getByText(/History could not load/)).toBeVisible();
  await expect(page.getByLabel("Current request words", { exact: true })).toHaveValue("Retain this before observing older work");
  await guard(page);
});
test("at 320px request and media pane controls remain reachable without losing words", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await project(page);
  await keepWords(page, "Words retained on a narrow screen");
  await page.getByRole("button", { name: "Project media", exact: true }).last().click();
  await page.getByRole("button", { name: "Request", exact: true }).click();
  await expect(page.getByLabel("Current request words", { exact: true })).toHaveValue("Words retained on a narrow screen");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await guard(page);
});
