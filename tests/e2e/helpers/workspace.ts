/**
 * A provider-free signed-in workspace for browser checks: one project, one
 * conversation, an open draft, accepted requests with ready results, and the
 * given capability profiles, all served through page.route.
 */

import type { Page, Route } from "@playwright/test";
import { jsonResponse } from "./responses";
import { TEST_USER } from "./auth";

export const PROJECT_ID = "project_e2e";
export const CONVERSATION_ID = "conversation_e2e";
const at = "2026-10-22T05:00:00.000Z";
const owner = TEST_USER.uid;
const context = { origin: "empty", requestIds: [], projectInstructionsRevision: 1 };
const destination = { projectId: PROJECT_ID, conversationId: CONVERSATION_ID };

export interface WorkspaceMedia {
  id: string;
  kind: "image" | "video" | "audio";
  label: string;
  requestId: string;
  slotId: string;
  url: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

export interface WorkspaceRequest {
  id: string;
  action: string;
  instructions: string;
  profileId: string;
  parameters: Record<string, string | number | boolean>;
  results: Array<{ versionId?: string; text?: string; outcome?: "completed" | "running" }>;
}

const ok = (data: unknown): ReturnType<typeof jsonResponse> => jsonResponse({ success: true, data });

function version(media: WorkspaceMedia): Record<string, unknown> {
  const audio = media.kind === "audio";
  return {
    schemaVersion: "vidra-workflow/v2", id: media.id, ownerId: owner, projectId: PROJECT_ID, kind: media.kind, label: media.label,
    origin: { kind: "generated", requestId: media.requestId, slotId: media.slotId }, sourceInputs: [],
    object: { identity: "unknown", assetId: media.id, storagePath: `users/${owner}/${media.id}` },
    metadata: { state: "verified", ...(audio ? {} : { width: media.width ?? 1280, height: media.height ?? 720 }), durationSeconds: media.durationSeconds ?? 0, audio: audio || media.kind === "video" ? "present" : "absent", probeVersion: "e2e" },
    association: "linked", createdAt: at,
  };
}

function request(row: WorkspaceRequest, index: number, profiles: ReadonlyArray<{ id: string; revision: string }>): Record<string, unknown> {
  const revision = profiles.find(profile => profile.id === row.profileId)?.revision ?? "1";
  return {
    schemaVersion: "vidra-workflow/v2", id: row.id, ownerId: owner, projectId: PROJECT_ID, conversationId: CONVERSATION_ID,
    submissionId: `submission_${index}`, executionDraftId: `draft_done_${index}`, executionDraftRevision: 1, acceptanceSequence: index + 1, snapshotHash: "a".repeat(64),
    snapshot: { action: row.action, instructions: row.instructions, inputs: [], settings: { profileId: row.profileId, profileRevision: revision, parameters: row.parameters, outputCount: row.results.length }, context, destination },
    materializedContext: { projectInstructions: "", entries: [] },
    slots: row.results.map((result, slot) => ({ id: `slot_${index}_${slot}`, ordinal: slot + 1, outcome: result.outcome ?? "completed", delivery: result.outcome === "running" ? "none" : "ready", ...(result.versionId ? { versionId: result.versionId } : {}), ...(result.text !== undefined ? { text: result.text } : {}), usage: { mode: "free", reserved: 0, settled: 0 } })),
    acceptedAt: at,
  };
}

export async function mockWorkspace(page: Page, input: { profiles: ReadonlyArray<{ id: string; revision: string }>; requests: WorkspaceRequest[]; media: WorkspaceMedia[] }): Promise<void> {
  const project = { schemaVersion: "vidra-workflow/v2", id: PROJECT_ID, ownerId: owner, revision: 1, name: "Evening campaign", status: "active", instructions: { revision: 1, text: "" }, origin: { kind: "new" }, createdAt: at, updatedAt: at };
  const conversation = { schemaVersion: "vidra-workflow/v2", id: CONVERSATION_ID, projectId: PROJECT_ID, ownerId: owner, revision: 1, name: "Stadium night", status: "active", acceptanceSequence: input.requests.length, initialContext: context, createdAt: at, updatedAt: at };
  let draft: Record<string, unknown> = { schemaVersion: "vidra-workflow/v2", id: "draft_open", ownerId: owner, projectId: PROJECT_ID, conversationId: CONVERSATION_ID, revision: 1, status: "open", action: "make-video", instructions: "", inputs: [], settings: { profileId: "unselected", profileRevision: "unresolved", parameters: {}, outputCount: 1 }, context, destination, createdAt: at, updatedAt: at };
  const requests = input.requests.map((row, index) => request(row, index, input.profiles));
  const media = input.media.map(version);
  const urls = new Map(input.media.map(item => [item.id, item.url]));
  await page.route("**/api/**", async (route: Route) => {
    const url = new URL(route.request().url());
    // Source modules under an api/ folder pass through; only the API itself is mocked.
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const path = url.pathname.replace(/^\/api/, "");
    const method = route.request().method();
    const access = /^\/projects\/[^/]+\/media\/([^/]+)\/access$/.exec(path);
    if (access) return route.fulfill(ok({ url: urls.get(access[1] ?? "") ?? `${url.origin}/missing.png` }));
    if (path === "/workflow/profiles") return route.fulfill(ok(input.profiles));
    if (path === `/projects/${PROJECT_ID}`) return route.fulfill(ok(project));
    if (path === `/projects/${PROJECT_ID}/conversations`) return route.fulfill(ok([conversation]));
    if (path === `/projects/${PROJECT_ID}/conversations/${CONVERSATION_ID}/requests`) return route.fulfill(ok(requests));
    if (path === `/projects/${PROJECT_ID}/conversations/${CONVERSATION_ID}/drafts`) {
      if (method === "POST") {
        const body = route.request().postDataJSON() as { id: string; content: Record<string, unknown> };
        draft = { ...draft, ...body.content, id: body.id, revision: 1, status: "open" };
        return route.fulfill(ok(draft));
      }
      return route.fulfill(ok([draft]));
    }
    if (method === "PATCH" && path.startsWith(`/projects/${PROJECT_ID}/drafts/`)) {
      const body = route.request().postDataJSON() as { expectedRevision: number; content: Record<string, unknown> };
      draft = { ...draft, ...body.content, revision: body.expectedRevision + 1 };
      return route.fulfill(ok({ state: "saved", draft }));
    }
    if (path === `/projects/${PROJECT_ID}/media`) return route.fulfill(ok(media));
    const status = /^\/creation-requests\/(request_[^/]+)$/.exec(path);
    const tracked = status ? requests.find(row => row.id === status[1]) : undefined;
    if (tracked) return route.fulfill(ok(tracked));
    if (path.endsWith("/imports") || path === "/folders" || path === "/projects") return route.fulfill(ok([]));
    return route.fulfill(jsonResponse({ success: false, error: "Not available in this check", code: "NOT_FOUND" }, 404));
  });
}
