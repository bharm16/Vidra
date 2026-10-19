import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { SavedImportSheet } from "../components/SavedImportSheet";

const version = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_saved", ownerId: "creator", projectId: "project_one", kind: "image", label: "Desk reference", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "verified", assetId: "desk", storagePath: "users/creator/desk.png", generation: "1", sha256: "a".repeat(64), bytes: 100 }, metadata: { state: "verified", width: 1920, height: 1080, durationSeconds: 0, audio: "absent", probeVersion: "controlled" }, association: "linked", createdAt: "2026-10-18T05:00:00.000Z" });
const scope = { ownerId: "creator", projectId: "project_one", projectName: "Evening campaign" };

it("only binds an explicitly chosen saved version and dismisses without another import operation", async () => {
  const onUseInput = vi.fn(); const onClose = vi.fn(); const access = vi.fn(async () => ({ url: "data:image/png;base64,eA==" }));
  render(<SavedImportSheet {...scope} version={version} access={access} onUseInput={onUseInput} onClose={onClose} />);
  expect(screen.getByRole("dialog", { name: "Image added" })).toBeVisible();
  expect(screen.getByText("Desk reference · v1")).toBeVisible();
  expect(screen.getByText("Saved in Evening campaign.")).toBeVisible();
  await waitFor(() => expect(access).toHaveBeenCalledExactlyOnceWith(version.id));
  expect(onUseInput).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledTimes(1); expect(onUseInput).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Use as input" }));
  expect(onUseInput).toHaveBeenCalledExactlyOnceWith(version);
});

it("cannot read or bind media outside the current owner/project or before verification", () => {
  const access = vi.fn(); const onUseInput = vi.fn(); const props = { ...scope, version, access, onUseInput, onClose: vi.fn() };
  const view = render(<SavedImportSheet {...props} ownerId="another-owner" />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(access).not.toHaveBeenCalled();
  view.rerender(<SavedImportSheet {...props} version={{ ...version, metadata: { state: "pending" } }} />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(access).not.toHaveBeenCalled(); expect(onUseInput).not.toHaveBeenCalled();
});

it("keeps saved-media inspection available while blocking input mutations in read-only work", async () => {
  const onUseInput = vi.fn(); const onClose = vi.fn();
  render(<SavedImportSheet {...scope} version={version} access={async () => ({ url: "data:image/png;base64,eA==" })} onUseInput={onUseInput} onClose={onClose} readOnly />);
  expect(screen.getByRole("button", { name: "Use as input" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Use as input" })); expect(onUseInput).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole("status", { name: "Opening preview" })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Close saved import" })); expect(onClose).toHaveBeenCalledTimes(1);
});
