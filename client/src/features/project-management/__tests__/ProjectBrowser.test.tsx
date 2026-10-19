import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProjectBrowser } from "../ProjectBrowser";
import { project, conversation } from "./fixtures";
import { readProjectCreationIntent } from "../state/projectCreationIntent";
const calls = vi.hoisted(() => ({ listProjects: vi.fn(), createProject: vi.fn(), createConversation: vi.fn(), changeProject: vi.fn(), currentUser: vi.fn() }));
vi.mock("../api/projectManagementApi", () => ({ ProjectManagementApi: class { listProjects = calls.listProjects; createProject = calls.createProject; createConversation = calls.createConversation; changeProject = calls.changeProject; } }));
vi.mock("@/repositories/index", () => ({ getAuthRepository: () => ({ getCurrentUser: calls.currentUser }) }));
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); calls.currentUser.mockReturnValue({ uid: "creator" }); calls.listProjects.mockResolvedValue([project]); calls.createProject.mockImplementation(async (id: string, name: string) => ({ ...project, id, name })); calls.createConversation.mockImplementation(async (projectId: string, id: string) => ({ ...conversation, id, projectId })); calls.changeProject.mockResolvedValue({ ...project, revision: 2 }); });
function browser(onOpen = vi.fn()): ReturnType<typeof render> { return render(<MemoryRouter><ProjectBrowser ownerId="creator" onOpen={onOpen} /></MemoryRouter>); }
describe("Project browser", () => {
  it("opens the selected real project without mutating an active draft", async () => {
    const open = vi.fn(); browser(open);
    fireEvent.click(await screen.findByRole("button", { name: "Open project Evening campaign" }));
    expect(open).toHaveBeenCalledWith(project.id);
    expect(calls.changeProject).not.toHaveBeenCalled();
  });
  it("provides real search/no-match and clears back to the saved list", async () => {
    browser(); await screen.findByRole("heading", { name: project.name });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search projects" }), { target: { value: "no matching project" } });
    expect(screen.getByRole("heading", { name: "No matching projects" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("heading", { name: project.name })).toBeVisible();
  });
  it("shows first-use empty and a failed-read retry", async () => {
    calls.listProjects.mockRejectedValueOnce(new Error("Could not load projects")).mockResolvedValueOnce([]);
    browser(); expect(await screen.findByRole("alert")).toHaveTextContent("Could not load projects");
    fireEvent.click(screen.getByRole("button", { name: "Reload projects" }));
    expect(await screen.findByRole("heading", { name: "Start your first project" })).toBeVisible();
  });
  it("retries a response-loss creation with the same captured identities and name", async () => {
    calls.createProject.mockRejectedValueOnce(new Error("Response lost")).mockImplementation(async (id: string, name: string) => ({ ...project, id, name }));
    const open = vi.fn(); browser(open); await screen.findByRole("heading", { name: project.name });
    fireEvent.click(screen.getByRole("button", { name: "New project" }));
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "New campaign" } });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    await screen.findByRole("button", { name: "Retry same project" });
    const retained = readProjectCreationIntent("creator");
    expect(retained?.name).toBe("New campaign");
    expect(screen.getByLabelText("Project name")).toHaveAttribute("readonly");
    fireEvent.click(screen.getByRole("button", { name: "Retry same project" }));
    await waitFor(() => expect(open).toHaveBeenCalledWith(retained?.projectId));
    expect(calls.createProject.mock.calls[0]).toEqual(calls.createProject.mock.calls[1]);
    expect(calls.createConversation).toHaveBeenCalledWith(retained?.projectId, retained?.conversationId, "First ideas");
    expect(readProjectCreationIntent("creator")).toBeUndefined();
  });
  it("restores only the selected trashed project's captured revision", async () => {
    calls.listProjects.mockResolvedValue([{ ...project, status: "trashed" }]); browser();
    await waitFor(() => expect(calls.listProjects).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Trash" }));
    fireEvent.click(await screen.findByRole("button", { name: "Restore project" }));
    await waitFor(() => expect(calls.changeProject).toHaveBeenCalledWith(project.id, { expectedRevision: 1, status: "active" }));
    expect(await screen.findByRole("heading", { name: "Trash is empty" })).toBeVisible();
  });
  it("does not open another owner's late project creation after account change", async () => {
    let complete: ((value: typeof project) => void) | undefined;
    calls.createProject.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const open = vi.fn(); const view = browser(open); await screen.findByRole("heading", { name: project.name });
    fireEvent.click(screen.getByRole("button", { name: "New project" }));
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Private project" } });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    calls.currentUser.mockReturnValue({ uid: "other" }); calls.listProjects.mockResolvedValue([]);
    view.rerender(<MemoryRouter><ProjectBrowser ownerId="other" onOpen={open} /></MemoryRouter>);
    await act(async () => complete?.(project));
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByText("Private project")).not.toBeInTheDocument();
  });
});
