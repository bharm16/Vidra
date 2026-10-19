import { test, expect } from "@playwright/test";
import { z } from "zod";
import { authenticated, authHeaders, data, guard, library, versions } from "./helpers";

test("words written signed out come back after sign-in and make exactly one picture when pressed", async ({ page }) => {
  await page.route("**/*", async route => { const host = new URL(route.request().url()).hostname; if (host === "127.0.0.1" || host === "localhost") await route.continue(); else await route.abort("blockedbyclient"); });
  await page.goto("/app");
  const words = page.getByLabel("Current request words", { exact: true });
  const text = `Signed out ${crypto.randomUUID()}`;
  await words.fill(text);
  await page.getByRole("button", { name: "Reference", exact: true }).click();
  await expect(page).toHaveURL(/\/signup\?redirect=/);
  const redirect = new URL(page.url()).searchParams.get("redirect") ?? "";
  expect(redirect).toMatch(/^\/app\?claim=guest_/);

  await authenticated(page);
  await page.goto(redirect);
  await expect(page).toHaveURL(/\/app\?conversation=conversation_/);
  await expect(words).toHaveValue(text);
  expect(await page.evaluate(() => localStorage.getItem("vidra-guest-draft/v1"))).toBeNull();
  const home = await library(page);
  const conversationId = new URL(page.url()).searchParams.get("conversation") ?? "";
  const history = async (): Promise<unknown[]> => data(await page.request.get(`/api/projects/${home.id}/conversations/${conversationId}/requests`, { headers: authHeaders }), z.array(z.unknown()));
  expect(await history()).toHaveLength(0);

  await page.getByRole("button", { name: "Choose request action", exact: true }).click();
  await page.getByRole("button", { name: "Make an image", exact: true }).click();
  await page.getByRole("button", { name: "Model: Choose a model", exact: true }).click();
  await page.getByRole("button", { name: "Flux Schnell", exact: true }).click();
  await page.getByRole("button", { name: "Make image", exact: true }).click();
  await expect.poll(async () => (await versions(page, home.id)).some(version => version.label === text), { timeout: 20000 }).toBe(true);
  expect(await history()).toHaveLength(1);
  await guard(page);
});
