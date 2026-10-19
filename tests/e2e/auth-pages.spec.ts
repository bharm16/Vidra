import { expect, test } from "@playwright/test";
import { injectAuthUser } from "./helpers/auth";
import { jsonResponse } from "./helpers/responses";

test.describe("auth pages", () => {
  test("sign-in shows field errors without submitting an empty form", async ({ page }) => {
    let authenticationRequests = 0;
    await page.route("**/identitytoolkit.googleapis.com/**", async route => { authenticationRequests += 1; await route.abort("blockedbyclient"); });
    await page.goto("/signin");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Enter a valid email address.", { exact: true })).toBeVisible();
    await expect(page.getByText("Enter your password.", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("aria-invalid", "true");
    expect(authenticationRequests).toBe(0);
  });

  test("switching to account creation preserves email and return intent without carrying the password", async ({ page }) => {
    const destination = "/app?intent=make-video";
    await page.goto(`/signin?redirect=${encodeURIComponent(destination)}`);
    await page.getByLabel("Email", { exact: true }).fill("creator@example.com");
    await page.getByLabel("Password", { exact: true }).fill("volatile-password");
    await page.getByRole("link", { name: "Create account", exact: true }).click();
    await expect(page).toHaveURL(`/signup?redirect=${encodeURIComponent(destination)}`);
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue("creator@example.com");
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
    expect(new URL(page.url()).searchParams.get("redirect")).toBe(destination);
    const passwordStored = await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)].some(value => typeof value === "string" && value.includes("volatile-password")));
    expect(passwordStored).toBe(false);
  });

  test("rejects short signup credentials before contacting authentication", async ({ page }) => {
    let authenticationRequests = 0;
    await page.route("**/identitytoolkit.googleapis.com/**", async route => { authenticationRequests += 1; await route.abort("blockedbyclient"); });
    await page.goto("/signup");
    await page.getByLabel("Email", { exact: true }).fill("not-an-address");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByText("Enter a valid email address.", { exact: true })).toBeVisible();
    await expect(page.getByText("Use at least 6 characters.", { exact: true })).toBeVisible();
    expect(authenticationRequests).toBe(0);
  });

  test("an authenticated visit rejects an external return destination", async ({ page, baseURL }) => {
    await injectAuthUser(page);
    await page.route("**/api/projects", async route => { await route.fulfill(jsonResponse({ success: true, data: [] })); });
    await page.goto("/signin?redirect=https%3A%2F%2Fexternal.example%2Fsteal");
    await expect(page).toHaveURL(/\/app$/);
    expect(new URL(page.url()).origin).toBe(new URL(baseURL ?? "http://127.0.0.1:58175").origin);
  });
});
