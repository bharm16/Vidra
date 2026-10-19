import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { authHeaders } from "./helpers";

test("all newly mounted private route families deny anonymous and foreign ownership without private data", async ({ request }) => {
  const state = await (await request.get("/__test/state")).json();
  const projectId = state.foreign.projectId as string;
  const conversationId = state.foreign.conversationId as string;
  const roots = ["/api/projects", "/api/account/usage", `/api/projects/${projectId}`, `/api/projects/${projectId}/conversations`, `/api/projects/${projectId}/media`, `/api/projects/${projectId}/imports`, `/api/projects/${projectId}/video-edits`, `/api/projects/${projectId}/exports`, `/api/projects/${projectId}/shares`];
  for (const path of roots) {
    const anonymous = await request.get(path);
    expect(anonymous.status(), path).toBe(401);
    expect(await anonymous.text()).not.toMatch(/Foreign private|storagePath|sha256/);
  }
  expect((await request.get("/api/account/usage", { headers: { "x-api-key": "invalid-proof-key" } })).status()).toBe(403);
  for (const path of roots.filter(path => path.includes(projectId))) {
    const denied = await request.get(path, { headers: authHeaders });
    expect(denied.status(), path).toBe(403);
    expect(await denied.text()).not.toMatch(/Foreign private|storagePath|sha256/);
  }
  const rename = await request.patch(`/api/projects/${projectId}/conversations/${conversationId}`, { headers: authHeaders, data: { expectedRevision: 1, name: "Stolen name" } });
  expect(rename.status()).toBe(403);
  const body = `data:image/png;base64,${(await readFile("tests/e2e/cross-mode/frame.png")).toString("base64")}`;
  const capture = { captureId: "capture_foreign_browser", displayedFrameId: "frame-proof", displayedAt: new Date().toISOString(), outputDataUri: body, drawingDataUri: body, inputs: { prompt: "Private attempt", strength: .875, steps: 8, seed: 42 } };
  expect((await request.post(`/api/projects/${projectId}/sketch/captures`, { data: capture })).status()).toBe(401);
  const sketch = await request.post(`/api/projects/${projectId}/sketch/captures`, { headers: authHeaders, data: capture });
  expect(sketch.status()).toBe(403);
  expect(await sketch.text()).not.toMatch(/Foreign private|storagePath|sha256/);
  const usage = await request.get("/api/account/usage?ownerId=foreign-browser-owner", { headers: authHeaders });
  expect(usage.status()).toBe(200);
  expect(await usage.text()).not.toMatch(/Foreign private|foreign-browser-owner/);
  expect((await (await request.get("/__test/state")).json()).outbound).toEqual([]);
});
