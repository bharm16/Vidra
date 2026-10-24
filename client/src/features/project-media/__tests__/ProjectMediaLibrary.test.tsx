import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkflowApi } from "@/features/project-workspace/api";
import type { Project } from "@shared/schemas/workflow/project.schemas";
import { MediaVersionSchema, type MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { ProjectMediaLibrary } from "../ProjectMediaLibrary";
import type { ImportJob, ProjectImportsController } from "@/features/project-imports/hooks/useProjectImports";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function library(versions: MediaVersion[], jobs: ImportJob[], desktop: boolean): ProjectImportsController {
  vi.stubGlobal("matchMedia", () => ({ matches: desktop, media: "(width >= 768px)", onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }));
  vi.spyOn(WorkflowApi.prototype, "access").mockResolvedValue({ url: "/controlled-picture.png" });
  vi.spyOn(WorkflowApi.prototype, "listProjects").mockResolvedValue([]);
  const imports: ProjectImportsController = { jobs, warning: undefined, choose: vi.fn(), retry: vi.fn(), cancel: vi.fn(), forgetRejected: vi.fn() };
  render(<ProjectMediaLibrary ownerId="creator" projectId="project_one" versions={versions} imports={imports} onChange={vi.fn()} onOpen={vi.fn()} onEdit={vi.fn()} onCreate={vi.fn()} onReload={vi.fn()} onProjects={vi.fn()} onOptions={vi.fn()} />);
  return imports;
}
const pending = (id: string, filename = "Desk reference"): ImportJob => ({ id, filename, state: "uploading", progress: 42, command: { id, filename, contentType: "image/png", bytes: 100, sha256: "a".repeat(64) } });

it("hides only the desktop job in its open progress popover and restores the same job on dismissal", async () => {
  const jobs = [pending("import_current"), pending("import_other", "Other upload")], saved = structuredClone(jobs);
  const imports = library([], jobs, true);
  fireEvent.click(screen.getByRole("button", { name: "Uploading Desk reference" }));
  await screen.findByRole("dialog", { name: "Import progress" });
  expect(screen.queryByRole("button", { name: "Uploading Desk reference" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Uploading Other upload" })).toBeInTheDocument();
  fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Import progress" })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Uploading Desk reference" }));
  expect(await screen.findByText("Uploading · 42%")).toBeInTheDocument();
  expect(jobs).toEqual(saved); expect(imports.cancel).not.toHaveBeenCalled(); expect(imports.retry).not.toHaveBeenCalled();
});

it("shows truthful first-import emptiness instead of a blank grid while its only desktop job is inspected", async () => {
  library([], [pending("import_first")], true);
  fireEvent.click(screen.getByRole("button", { name: "Uploading Desk reference" }));
  await screen.findByRole("dialog", { name: "Import progress" });
  expect(screen.getByRole("heading", { name: "No media yet" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "No matching media" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Uploading Desk reference" })).not.toBeInTheDocument();
});

it("keeps the inspected pending card present under a mobile import sheet", async () => {
  const jobs = [pending("import_mobile")], saved = structuredClone(jobs);
  library([], jobs, false);
  fireEvent.click(screen.getByRole("button", { name: "Uploading Desk reference" }));
  await screen.findByRole("dialog", { name: "Import progress" });
  expect(screen.getByRole("button", { name: "Uploading Desk reference" })).toBeInTheDocument();
  expect(jobs).toEqual(saved);
});

it("retains no-matching feedback when only the inspected desktop job matches the active search", async () => {
  const saved = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_other", ownerId: "creator", projectId: "project_one", kind: "image", label: "Saved picture", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "unknown", assetId: "picture", storagePath: "users/creator/picture.png" }, metadata: { state: "verified", width: 64, height: 36, durationSeconds: 0, audio: "absent", probeVersion: "test" }, association: "linked", createdAt: "2026-10-18T00:00:00.000Z" });
  library([saved], [pending("import_matching")], true);
  fireEvent.change(screen.getByRole("searchbox", { name: "Find media" }), { target: { value: "Desk reference" } });
  fireEvent.click(screen.getByRole("button", { name: "Uploading Desk reference" }));
  await screen.findByRole("dialog", { name: "Import progress" });
  expect(screen.getByRole("heading", { name: "No matching media" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
});

it("keeps keyboard focus inside Copy while its destination list is pending and after it resolves", async () => {
  let resolveProjects: (projects: Project[]) => void = () => undefined;
  const projects = new Promise<Project[]>(resolve => { resolveProjects = resolve; });
  vi.spyOn(WorkflowApi.prototype, "listProjects").mockResolvedValueOnce([{ id: "project_two", status: "active" } as Project]).mockReturnValue(projects);
  vi.spyOn(WorkflowApi.prototype, "access").mockResolvedValue({ url: "data:image/png;base64,eA==" });
  const version = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_saved", ownerId: "creator", projectId: "project_one", kind: "image", label: "Desk", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "verified", assetId: "desk", storagePath: "users/creator/desk.png", generation: "1", sha256: "a".repeat(64), bytes: 100 }, metadata: { state: "verified", width: 1920, height: 1080, durationSeconds: 0, audio: "absent", probeVersion: "controlled" }, association: "linked", createdAt: "2026-10-18T05:00:00.000Z" });
  render(<ProjectMediaLibrary ownerId="creator" projectId="project_one" versions={[version]} imports={{ jobs: [], warning: undefined, choose: vi.fn(), retry: vi.fn(), cancel: vi.fn(), forgetRejected: vi.fn() }} onChange={vi.fn()} onOpen={vi.fn()} onEdit={vi.fn()} onCreate={vi.fn()} onReload={vi.fn()} onProjects={vi.fn()} onOptions={vi.fn()} />);
  const more = screen.getByRole("button", { name: "More for Desk" });
  act(() => { more.focus(); }); fireEvent.keyDown(more, { key: "Enter", code: "Enter" });
  await screen.findByRole("menuitem", { name: "Copy to project" });
  fireEvent.keyDown(document.activeElement ?? more, { key: "Escape", code: "Escape" });
  await waitFor(() => expect(more).toHaveFocus());
  fireEvent.keyDown(more, { key: "Enter", code: "Enter" });
  const copy = await screen.findByRole("menuitem", { name: "Copy to project" });
  act(() => { copy.focus(); }); fireEvent.keyDown(copy, { key: "Enter", code: "Enter" });
  const panel = await screen.findByRole("dialog", { name: "Copy to project" });
  const destination = screen.getByLabelText("Destination project");
  expect(destination).toBeDisabled();
  await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));
  await act(async () => { resolveProjects([]); await projects; });
  await waitFor(() => expect(destination).not.toBeDisabled());
  expect(panel.contains(document.activeElement)).toBe(true);
  fireEvent.keyDown(destination, { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Copy to project" })).not.toBeInTheDocument());
  await waitFor(() => expect(more).toHaveFocus());
});

it("offers Copy to project only when another active project can receive the media", async () => {
  const version = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_saved", ownerId: "creator", projectId: "project_one", kind: "image", label: "Desk", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "verified", assetId: "desk", storagePath: "users/creator/desk.png", generation: "1", sha256: "a".repeat(64), bytes: 100 }, metadata: { state: "verified", width: 1920, height: 1080, durationSeconds: 0, audio: "absent", probeVersion: "controlled" }, association: "linked", createdAt: "2026-10-18T05:00:00.000Z" });
  library([version], [], true);
  const more = screen.getByRole("button", { name: "More for Desk" });
  await waitFor(() => expect(WorkflowApi.prototype.listProjects).toHaveBeenCalled());
  act(() => { more.focus(); }); fireEvent.keyDown(more, { key: "Enter", code: "Enter" });
  await screen.findByRole("menuitem", { name: "Hide" });
  expect(screen.queryByRole("menuitem", { name: "Copy to project" })).not.toBeInTheDocument();
});
