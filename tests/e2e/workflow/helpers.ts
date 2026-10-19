import { expect, type APIResponse, type Page } from "@playwright/test";
import { z } from "zod";
import { injectAuthUser } from "../helpers/auth";
import { ProjectSchema, ConversationListingSchema, type Project, type ConversationListing } from "@shared/schemas/workflow/project.schemas";
import { CreationDraftSchema, type CreationDraft } from "@shared/schemas/workflow/draft.schemas";
import { MediaVersionSchema, type MediaVersion } from "@shared/schemas/workflow/media.schemas";
export const KEY = "replay-cross-mode-key";
export const OWNER = `api-key:${KEY}`;
export const authHeaders = { "x-api-key": KEY };
export async function data<T extends z.ZodType>(response: APIResponse, schema: T): Promise<z.output<T>> { expect(response.ok(), await response.text()).toBe(true); const envelope = z.object({ success: z.literal(true), data: z.unknown() }).parse(await response.json()); return schema.parse(envelope.data); }
export async function authenticated(page: Page): Promise<void> {
  await injectAuthUser(page, { uid: OWNER, email: "workflow-proof@example.com", displayName: "Workflow proof" });
  await page.setExtraHTTPHeaders(authHeaders);
  await page.route("**/*", async route => { const host = new URL(route.request().url()).hostname; if (host === "127.0.0.1" || host === "localhost") await route.continue(); else await route.abort("blockedbyclient"); });
}
export function projectId(page: Page): string { const id = /\/app\/project\/([^/?]+)/.exec(page.url())?.[1]; if (!id) throw new Error(`No project in ${page.url()}`); return decodeURIComponent(id); }
export async function project(page: Page, action: "picture" | "clip" = "picture"): Promise<string> {
  await page.goto("/app");
  await page.getByRole("button", { name: "New project", exact: true }).first().click();
  await page.getByLabel("Project name", { exact: true }).fill(`Browser ${crypto.randomUUID()}`);
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await page.waitForURL(/\/app\/project\//);
  await expect(page.getByLabel("Current request words", { exact: true })).toBeVisible();
  if (action === "clip") { await page.getByRole("button", { name: "Choose request action", exact: true }).click(); await page.getByRole("button", { name: "Make a video", exact: true }).click(); }
  await page.getByRole("button", { name: "Model: Choose a model", exact: true }).click();
  await page.getByRole("button", { name: action === "clip" ? "Wan 2.2" : "Flux Schnell", exact: true }).click();
  return projectId(page);
}
export async function conversations(page: Page, id = projectId(page)): Promise<ConversationListing[]> { return data(await page.request.get(`/api/projects/${id}/conversations`, { headers: authHeaders }), z.array(ConversationListingSchema)); }
export async function drafts(page: Page, id = projectId(page)): Promise<CreationDraft[]> { const rows = await conversations(page, id); const selected = new URL(page.url()).searchParams.get("conversation") ?? rows[0]?.id; if (!selected) throw new Error("No current conversation"); return data(await page.request.get(`/api/projects/${id}/conversations/${selected}/drafts`, { headers: authHeaders }), z.array(CreationDraftSchema)); }
export async function keepWords(page: Page, words: string): Promise<void> { await page.getByLabel("Current request words", { exact: true }).fill(words); await page.getByLabel("Current request words", { exact: true }).blur(); await expect.poll(async () => (await drafts(page)).some(draft => draft.instructions === words), { timeout: 15000 }).toBe(true); }
export async function versions(page: Page, id = projectId(page)): Promise<MediaVersion[]> { return data(await page.request.get(`/api/projects/${id}/media`, { headers: authHeaders }), z.array(MediaVersionSchema)); }
export async function makePicture(page: Page, words = "A runner under warm stadium lights"): Promise<string> { await keepWords(page, words); await page.getByRole("button", { name: "Make image", exact: true }).click(); await expect.poll(async () => (await versions(page)).find(version => version.label === words)?.id, { timeout: 20000 }).toBeTruthy(); return (await versions(page)).find(version => version.label === words)!.id; }
export async function ownedProject(page: Page, id = projectId(page)): Promise<Project> { return data(await page.request.get(`/api/projects/${id}`, { headers: authHeaders }), ProjectSchema); }
export async function guard(page: Page): Promise<void> { const state = await page.request.get("/__test/state"); expect((await state.json()).outbound).toEqual([]); }
