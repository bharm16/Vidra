import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ProjectManagementPanel } from "../ProjectManagementPanel";
import { project, conversation } from "./fixtures";
const patch = vi.hoisted(() => vi.fn());
vi.mock("../api/projectManagementApi", () => ({ ProjectManagementApi: class { changeProject = patch; } }));
vi.mock("@/repositories/index", () => ({ getAuthRepository: () => ({ getCurrentUser: () => ({ uid: "creator" }) }) }));
beforeEach(() => vi.resetAllMocks());
describe("Project panel pending mutations", () => {
  it("does not publish a late rename callback after the panel closes", async () => {
    let finish: ((value: typeof project) => void) | undefined;
    patch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const changed = vi.fn();
    const view = render(<ProjectManagementPanel ownerId="creator" project={project} conversations={[conversation]} onProjectChange={changed} onConversationChange={vi.fn()} onOpenConversation={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename project" }));
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "New name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    view.unmount();
    await act(async () => finish?.({ ...project, name: "New name", revision: 2 }));
    expect(changed).not.toHaveBeenCalled();
  });
});
