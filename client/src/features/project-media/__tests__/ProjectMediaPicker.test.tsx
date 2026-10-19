import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import type { ProjectImportsController } from "@/features/project-imports/hooks/useProjectImports";
import { ProjectMediaPicker } from "../ProjectMediaPicker";

const picture = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_desk", ownerId: "creator", projectId: "project_one", label: "Desk", kind: "image", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "unknown", assetId: "desk", storagePath: "users/creator/desk.png" }, metadata: { state: "verified", width: 640, height: 360, durationSeconds: 0, audio: "absent", probeVersion: "controlled" }, association: "linked", createdAt: "2026-10-17T05:00:00.000Z" });
const clip = MediaVersionSchema.parse({ ...picture, id: "version_clip", label: "Evening run", kind: "video", metadata: { ...picture.metadata, durationSeconds: 5 } });
const imports: ProjectImportsController = { jobs: [], warning: undefined, choose: vi.fn(), retry: vi.fn(), cancel: vi.fn(), forgetRejected: vi.fn() };

it("clears a failed search within the requested media kind and chooses one exact version immediately", async () => {
  const onChoose = vi.fn();
  render(<ProjectMediaPicker versions={[picture, clip]} imports={imports} access={async () => ({ url: "/fixture.png" })} onChoose={onChoose} disabled={false} onImport={vi.fn()} selectedVersionId={picture.id} />);
  fireEvent.click(screen.getByRole("button", { name: "Choose a media input" }));
  const search = await screen.findByRole("searchbox", { name: "Find project media" });
  expect(search).toHaveAttribute("placeholder", "Search pictures");
  expect(screen.queryByRole("button", { name: "Open Evening run" })).not.toBeInTheDocument();
  fireEvent.change(search, { target: { value: "neon" } });
  expect(screen.getByText("No matching pictures")).toBeVisible();
  expect(onChoose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  fireEvent.click(await screen.findByRole("button", { name: "Open Desk" }));
  expect(onChoose).toHaveBeenCalledExactlyOnceWith(picture);
  await waitFor(() => expect(screen.queryByRole("searchbox", { name: "Find project media" })).not.toBeInTheDocument());
  expect(imports.cancel).not.toHaveBeenCalled();
});

it("opens only for a new explicit request token and preserves a missing selected version until a deliberate replacement", async () => {
  const onChoose = vi.fn();
  const props = { versions: [picture], imports, access: async (): Promise<{ url: string }> => ({ url: "/fixture.png" }), onChoose, disabled: false, onImport: vi.fn(), selectedVersionId: "version_missing", selectedVersionLabel: "Desk · v2" };
  const { rerender } = render(<ProjectMediaPicker {...props} requestOpenKey="draft_one:primary:1" />);
  expect(await screen.findByText("Desk · v2 is no longer available")).toBeVisible();
  expect(onChoose).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("searchbox", { name: "Find project media" }), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("searchbox", { name: "Find project media" })).not.toBeInTheDocument());
  rerender(<ProjectMediaPicker {...props} requestOpenKey="draft_one:primary:1" />);
  expect(screen.queryByRole("searchbox", { name: "Find project media" })).not.toBeInTheDocument();
  rerender(<ProjectMediaPicker {...props} requestOpenKey="draft_one:primary:2" />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Desk" }));
  expect(onChoose).toHaveBeenCalledExactlyOnceWith(picture);
});
