import { describe, expect, it, vi } from "vitest";
import { VersionShareSchema } from "@shared/schemas/workflow/sharing.schemas";
import { OwnedSharesApi, SharingApiError } from "../api/sharingApi";

vi.mock("@/repositories/index", () => ({ getAuthRepository: () => ({ getCurrentUser: () => ({ uid: "creator" }) }) }));
vi.mock("@/services/http/firebaseAuth", () => ({ buildFirebaseAuthHeaders: vi.fn(async () => ({})) }));

const ID = "f6079012-0089-43be-a1ba-c6d3be995f22";
const at = "2026-10-17T00:00:00.000Z";
const share = VersionShareSchema.parse({ id: ID, ownerId: "creator", projectId: "project_share", versionId: "version_picture", sharingEpoch: 0, revoked: true, kind: "image", label: "A ready picture", createdAt: at });
function success(data: unknown): Response { return new Response(JSON.stringify({ success: true, data }), { status: 200 }); }

describe("OwnedSharesApi revoke", () => {
  it("posts the revocation for the exact link and returns the confirmed private share", async () => {
    const rawRequest = vi.fn(async (_path: string, _options?: unknown) => success(share));
    expect(await new OwnedSharesApi("creator", { rawRequest }).revoke(share.projectId, ID)).toEqual(share);
    expect(rawRequest).toHaveBeenCalledWith(`/projects/project_share/shares/${ID}/revoke`, { method: "POST", body: {} });
  });

  it("does not treat a still-public or different link as revoked", async () => {
    const rawRequest = vi.fn(async (_path: string, _options?: unknown) => success({ ...share, revoked: false }));
    const api = new OwnedSharesApi("creator", { rawRequest });
    await expect(api.revoke(share.projectId, ID)).rejects.toThrow("revocation was not confirmed");
    rawRequest.mockResolvedValueOnce(success({ ...share, id: "f6079012-0089-43be-a1ba-c6d3be995f23" }));
    await expect(api.revoke(share.projectId, ID)).rejects.toThrow("revocation was not confirmed");
  });

  it("rejects a malformed share id before sending and maps a server denial to its status", async () => {
    const rawRequest = vi.fn(async (_path: string, _options?: unknown) => new Response(JSON.stringify({ error: "This link is not yours." }), { status: 403 }));
    const api = new OwnedSharesApi("creator", { rawRequest });
    await expect(api.revoke(share.projectId, "not-a-share")).rejects.toThrow();
    expect(rawRequest).not.toHaveBeenCalled();
    const denied: unknown = await api.revoke(share.projectId, ID).catch((error: unknown) => error);
    expect(denied).toBeInstanceOf(SharingApiError);
    expect(denied).toMatchObject({ message: "This link is not yours.", status: 403 });
  });
});

describe("OwnedSharesApi access", () => {
  it("reads uncached media access for the exact version", async () => {
    const rawRequest = vi.fn(async (_path: string, _options?: unknown) => success({ url: "https://media.example.test/picture.png", expiresAt: at }));
    const abort = new AbortController();
    expect(await new OwnedSharesApi("creator", { rawRequest }).access(share.projectId, share.versionId, abort.signal)).toEqual({ url: "https://media.example.test/picture.png", expiresAt: at });
    expect(rawRequest).toHaveBeenCalledWith("/projects/project_share/media/version_picture/access", { signal: abort.signal, fetchOptions: { cache: "no-store" } });
  });

  it("rejects non-web access URLs and an unreadable failure body", async () => {
    const rawRequest = vi.fn(async (_path: string, _options?: unknown) => success({ url: "javascript:alert(1)" }));
    const api = new OwnedSharesApi("creator", { rawRequest });
    await expect(api.access(share.projectId, share.versionId)).rejects.toThrow();
    rawRequest.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    await expect(api.access(share.projectId, share.versionId)).rejects.toMatchObject({ name: "SharingApiError", message: "The sharing request was not confirmed.", status: 503 });
  });
});
