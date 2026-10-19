import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProjectManagementPanel } from "../ProjectManagementPanel";
import { project, conversation, folder } from "./fixtures";
const calls = vi.hoisted(() => ({ changeProject: vi.fn(), changeConversation: vi.fn(), getProject: vi.fn(), changeFolder: vi.fn(), listFolders: vi.fn() }));
vi.mock("../api/projectManagementApi", () => ({ ProjectManagementApi: class { changeProject = calls.changeProject; changeConversation = calls.changeConversation; getProject = calls.getProject; changeFolder = calls.changeFolder; listFolders = calls.listFolders; } }));
vi.mock("@/repositories/index", () => ({ getAuthRepository: () => ({ getCurrentUser: () => ({ uid: "creator" }) }) }));
const callbacks = { onProjectChange: vi.fn(), onConversationChange: vi.fn(), onOpenConversation: vi.fn(), onClose: vi.fn() };
beforeEach(() => { vi.clearAllMocks(); calls.changeProject.mockResolvedValue({ ...project, revision: 2 }); calls.changeConversation.mockResolvedValue({ ...conversation, revision: 2, status: "archived" }); });
function panel(overrides: Partial<React.ComponentProps<typeof ProjectManagementPanel>> = {}): ReturnType<typeof render> { return render(<ProjectManagementPanel ownerId="creator" project={project} conversations={[conversation]} {...callbacks} {...overrides} />); }
describe("Project and conversation management", () => {
  it("renames and trashes the open project, not the library that holds its work", async () => {
    const library = { ...project, role: "library" as const };
    const onFolderChange = vi.fn();
    calls.changeFolder.mockResolvedValue({ ...folder, revision: 2, name: "Summer launch" });
    panel({ project: library, conversations: [{ ...conversation, folderId: folder.id }, { ...conversation, id: "conversation_loose" as typeof conversation.id }], folder, onFolderChange });
    fireEvent.click(screen.getByRole("button", { name: /Rename project/ }));
    expect(screen.getByLabelText("Project name")).toHaveValue(folder.name);
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Summer launch" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onFolderChange).toHaveBeenCalledWith(expect.objectContaining({ name: "Summer launch" })));
    expect(calls.changeFolder).toHaveBeenCalledWith(folder.id, { expectedRevision: 1, name: "Summer launch" });
    expect(calls.changeProject).not.toHaveBeenCalled();
  });
  it("files a library conversation into a project and takes it out again", async () => {
    const library = { ...project, role: "library" as const };
    calls.listFolders.mockResolvedValue([folder]);
    calls.changeConversation.mockResolvedValue({ ...conversation, revision: 2, folderId: folder.id });
    panel({ project: library });
    fireEvent.click(screen.getByRole("button", { name: /^Conversations/ }));
    fireEvent.click(screen.getByRole("button", { name: `Add ${conversation.name} to a project` }));
    fireEvent.click(await screen.findByRole("button", { name: folder.name }));
    await waitFor(() => expect(calls.changeConversation).toHaveBeenCalledWith(library.id, conversation.id, { expectedRevision: 1, folderId: folder.id }));
    cleanup();
    panel({ project: library, conversations: [{ ...conversation, folderId: folder.id }] });
    fireEvent.click(screen.getByRole("button", { name: /^Conversations/ }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from project" }));
    await waitFor(() => expect(calls.changeConversation).toHaveBeenLastCalledWith(library.id, conversation.id, { expectedRevision: 1, folderId: null }));
  });
  it("offers no rename or trash for the library, which holds work outside named projects", () => {
    panel({ project: { ...project, role: "library" } });
    expect(screen.queryByRole("button", { name: /Rename project/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Move to Trash/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Archived conversations/ })).toBeInTheDocument();
  });
  it("retains a failed name edit and retries against the revision it started from", async () => {
    calls.changeProject.mockRejectedValueOnce(new Error("This project changed in another window.")); panel();
    fireEvent.click(screen.getByRole("button", { name: "Rename project" }));
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: " New direction " } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("changed in another window");
    expect(screen.getByLabelText("Project name")).toHaveValue(" New direction ");
    expect(calls.changeProject).toHaveBeenCalledWith(project.id, { expectedRevision: 1, name: "New direction" });
    expect(callbacks.onProjectChange).not.toHaveBeenCalled();
  });
  it("saves only the project name and preserves existing instructions and history", async () => {
    panel(); fireEvent.click(screen.getByRole("button", { name: "Rename project" }));
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "New project name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(callbacks.onProjectChange).toHaveBeenCalled());
    expect(calls.changeProject).toHaveBeenCalledWith(project.id, { expectedRevision: 1, name: "New project name" });
    expect(calls.changeConversation).not.toHaveBeenCalled();
  });
  it("opens and archives the exact named conversation", async () => {
    panel(); fireEvent.click(screen.getByRole("button", { name: "Conversations" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(callbacks.onConversationChange).toHaveBeenCalledWith(expect.objectContaining({ id: conversation.id, revision: 2 })));
    expect(calls.changeConversation).toHaveBeenCalledWith(project.id, conversation.id, { expectedRevision: 1, status: "archived" });
  });
  it("restores archived conversations without creating a replacement", async () => {
    panel({ conversations: [{ ...conversation, status: "archived", revision: 3 }] });
    fireEvent.click(screen.getByRole("button", { name: "Archived conversations" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(calls.changeConversation).toHaveBeenCalledWith(project.id, conversation.id, { expectedRevision: 3, status: "active" }));
  });
  it("moves the project to trash only after its explicit action", async () => {
    panel(); fireEvent.click(screen.getByRole("button", { name: "Move to Trash" }));
    expect(calls.changeProject).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Move to Trash" }));
    await waitFor(() => expect(calls.changeProject).toHaveBeenCalledWith(project.id, { expectedRevision: 1, status: "trashed" }));
  });
  it("hides foreign project data and blocks mutations", () => {
    panel({ ownerId: "other" });
    expect(screen.getByRole("heading", { name: "Project unavailable" })).toBeVisible();
    expect(screen.queryByText(project.name)).not.toBeInTheDocument();
    expect(screen.queryByText(conversation.name)).not.toBeInTheDocument();
    expect(calls.changeProject).not.toHaveBeenCalled();
  });
});
