import { z } from "zod";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OwnedRequest } from "../OwnedRequest";

const auth = vi.hoisted(() => ({ owner: "creator" }));
vi.mock("@/repositories/index", () => ({ getAuthRepository: () => ({ getCurrentUser: () => ({ uid: auth.owner }) }) }));
vi.mock("@/services/http/firebaseAuth", () => ({ buildFirebaseAuthHeaders: vi.fn(async () => ({})) }));
beforeEach(() => { auth.owner = "creator"; });
afterEach(() => vi.unstubAllGlobals());
it("rejects an account switch while decoding a response", async () => {
  const client = { rawRequest: vi.fn(async () => ({ ok: true, status: 200, json: async () => { auth.owner = "other"; return { success: true, data: "private" }; } } as Response)) };
  await expect(new OwnedRequest("creator", client).request("/private", z.string())).rejects.toMatchObject({ status: 401, code: "AUTH_REQUIRED" });
  expect(client.rawRequest).toHaveBeenCalledTimes(1);
});
it("does not resend a mutation after an authentication failure", async () => {
  const rawRequest = vi.fn(async () => new Response(JSON.stringify({ success: false, error: "Sign in", code: "AUTH_REQUIRED" }), { status: 401 }));
  await expect(new OwnedRequest("creator", { rawRequest }).request("/creation-requests", z.string(), "POST", {})).rejects.toMatchObject({ status: 401 });
  expect(rawRequest).toHaveBeenCalledTimes(1);
});
it("keeps authenticated reads out of the browser cache", async () => {
  const send = vi.fn(async () => new Response(JSON.stringify({ success: true, data: "owned" }), { status: 200 })); vi.stubGlobal("fetch", send);
  expect(await new OwnedRequest("creator").request("/private", z.string())).toBe("owned");
  expect(send).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ cache: "no-store" }));
});
