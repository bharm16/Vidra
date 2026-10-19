import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectManagementApi } from "../api/projectManagementApi";
import { ProjectSchema, ConversationSchema } from "@shared/schemas/workflow/project.schemas";
const current = vi.hoisted(() => vi.fn());
vi.mock("@/repositories/index", () => ({ getAuthRepository: () => ({ getCurrentUser: current }) }));
const at = "2026-10-17T00:00:00.000Z";
export const project = ProjectSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "project_one", ownerId: "creator", revision: 1, name: "Evening campaign", status: "active", instructions: { revision: 1, text: "Keep evening light." }, origin: { kind: "new" }, createdAt: at, updatedAt: at });
export const conversation = ConversationSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "conversation_one", projectId: project.id, ownerId: "creator", revision: 1, name: "First ideas", status: "active", acceptanceSequence: 0, initialContext: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, createdAt: at, updatedAt: at });
const response = (data: unknown): { ok: true; json(): Promise<unknown> } => ({ ok: true, json: async () => ({ success: true, data }) });
beforeEach(() => { vi.resetAllMocks(); current.mockReturnValue({ uid: "creator" }); });
describe("Project management owner boundary", () => {
  it("blocks signed-out or foreign account operations before sending", async () => {
    const rawRequest = vi.fn();
    const api = new ProjectManagementApi("creator", { rawRequest });
    current.mockReturnValue({ uid: "other" });
    await expect(api.listProjects()).rejects.toThrow("original account");
    await expect(api.changeProject(project.id, { expectedRevision: 1, name: "New name" })).rejects.toThrow("original account");
    expect(rawRequest).not.toHaveBeenCalled();
  });
  it("rejects foreign projects and conversations from the wire", async () => {
    const rawRequest = vi.fn().mockResolvedValue(response([{ ...project, ownerId: "other" }]));
    const api = new ProjectManagementApi("creator", { rawRequest });
    await expect(api.listProjects()).rejects.toThrow();
    rawRequest.mockResolvedValue(response({ ...conversation, projectId: "project_other" }));
    await expect(api.changeConversation(project.id, conversation.id, { expectedRevision: 1, status: "archived" })).rejects.toThrow();
  });
  it("rejects a different acknowledged identity and malformed responses", async () => {
    const rawRequest = vi.fn().mockResolvedValue(response({ ...project, id: "project_other" }));
    const api = new ProjectManagementApi("creator", { rawRequest });
    await expect(api.createProject(project.id, project.name)).rejects.toThrow();
    rawRequest.mockResolvedValue(response({ ...conversation, revision: "1" }));
    await expect(api.createConversation(project.id, conversation.id, conversation.name)).rejects.toThrow();
  });
  it("keeps writes owner-bound if authentication changes while reading the body", async () => {
    const rawRequest = vi.fn().mockResolvedValue({ ok: true, json: async () => { current.mockReturnValue({ uid: "other" }); return { success: true, data: project }; } });
    await expect(new ProjectManagementApi("creator", { rawRequest }).changeProject(project.id, { expectedRevision: 1, name: "New name" })).rejects.toThrow("original account");
  });
  it("validates patches and transmits the captured expected revision", async () => {
    const rawRequest = vi.fn().mockResolvedValue(response({ ...conversation, revision: 2, status: "archived" }));
    const api = new ProjectManagementApi("creator", { rawRequest });
    expect((await api.changeConversation(project.id, conversation.id, { expectedRevision: 1, status: "archived" })).revision).toBe(2);
    expect(rawRequest).toHaveBeenCalledWith(`/projects/${project.id}/conversations/${conversation.id}`, { method: "PATCH", body: { expectedRevision: 1, status: "archived" } });
    expect(() => api.changeProject(project.id, { expectedRevision: 1, name: " " })).toThrow();
    expect(() => api.changeConversation(project.id, conversation.id, { expectedRevision: 1 })).toThrow();
  });
});
describe("Project management reads", () => {
  it("reads one owned project and rejects a different project identity", async () => {
    const rawRequest = vi.fn().mockResolvedValue(response(project));
    const api = new ProjectManagementApi("creator", { rawRequest });
    expect((await api.getProject(project.id)).name).toBe("Evening campaign");
    expect(rawRequest).toHaveBeenCalledWith(`/projects/${project.id}`, { method: "GET" });
    rawRequest.mockResolvedValue(response({ ...project, id: "project_other" }));
    await expect(api.getProject(project.id)).rejects.toThrow();
  });
  it("lists a project's conversations with media counts and rejects a conversation from another project", async () => {
    const rawRequest = vi.fn().mockResolvedValue(response([{ ...conversation, media: { pictures: 2, clips: 1 } }]));
    const api = new ProjectManagementApi("creator", { rawRequest });
    expect((await api.listConversations(project.id))[0]?.media).toEqual({ pictures: 2, clips: 1 });
    expect(rawRequest).toHaveBeenCalledWith(`/projects/${project.id}/conversations`, { method: "GET" });
    rawRequest.mockResolvedValue(response([conversation, { ...conversation, id: "conversation_two", projectId: "project_other" }]));
    await expect(api.listConversations(project.id)).rejects.toThrow("requested project and account");
  });
  it("maps an unreadable read failure to a retryable message and rejects a malformed project id before sending", async () => {
    const rawRequest = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => { throw new SyntaxError("Unexpected token"); } });
    const api = new ProjectManagementApi("creator", { rawRequest });
    await expect(api.getProject(project.id)).rejects.toMatchObject({ name: "WorkflowApiError", status: 500, code: undefined, message: expect.stringContaining("not confirmed") });
    expect(() => api.listConversations("not-a-project")).toThrow();
    expect(rawRequest).toHaveBeenCalledTimes(1);
  });
});
