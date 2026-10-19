import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProjectManagementPanel } from "../ProjectManagementPanel";
import { project, conversation } from "./fixtures";
const calls = vi.hoisted(() => ({ changeProject: vi.fn(), changeConversation: vi.fn(), getProject: vi.fn() }));
vi.mock("../api/projectManagementApi", () => ({ ProjectManagementApi: class { changeProject = calls.changeProject; changeConversation = calls.changeConversation; getProject = calls.getProject; } }));
vi.mock("@/repositories/index", () => ({ getAuthRepository: () => ({ getCurrentUser: () => ({ uid: "creator" }) }) }));
const callbacks = { onProjectChange: vi.fn(), onConversationChange: vi.fn(), onOpenConversation: vi.fn(), onClose: vi.fn() };
beforeEach(() => { vi.clearAllMocks(); calls.changeProject.mockResolvedValue({ ...project, revision: 2 }); calls.changeConversation.mockResolvedValue({ ...conversation, revision: 2, status: "archived" }); });
function panel(overrides: Partial<React.ComponentProps<typeof ProjectManagementPanel>> = {}): ReturnType<typeof render> { return render(<ProjectManagementPanel ownerId="creator" project={project} conversations={[conversation]} {...callbacks} {...overrides} />); }
describe("Project and conversation management", () => {
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
