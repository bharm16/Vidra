import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { ProjectAreaMaskSchema } from "@shared/schemas/workflow/sketch.schemas";
import { AreaEditPanel } from "../AreaEditPanel";

vi.mock("../components/DrawingCanvas", async () => { const { forwardRef } = await import("react"); return { DrawingCanvas: forwardRef(function DrawingCanvas({ onSnapshot, onHistory }: { onSnapshot(uri: string): void; onHistory(undo: boolean, redo: boolean, painted: boolean): void }, _ref) { return <canvas data-testid="paint" onPointerUp={() => { onSnapshot("data:image/png;base64,YQ=="); onHistory(true, false, true); }} />; }) }; });
const version = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_source", projectId: "project_one", ownerId: "owner", kind: "image", label: "Exact source", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "unknown", assetId: "source", storagePath: "users/owner/previews/images/source.png" }, metadata: { state: "verified", width: 1200, height: 800, durationSeconds: 0, audio: "absent", probeVersion: "controlled" }, association: "linked", createdAt: "2026-10-17T00:00:00.000Z" });
it("keeps a source-bound selection and hands it over on Done", () => {
  const done = vi.fn(); render(<AreaEditPanel version={version} sourceUrl="/source.png" onDone={done} />);
  expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
  fireEvent.pointerUp(screen.getByTestId("paint")); fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(done).toHaveBeenCalledWith({ versionId: version.id, width: 1200, height: 800, transform: "identity", dataUri: "data:image/png;base64,YQ==" });
  expect(screen.queryByText(/Area edits are unavailable/)).not.toBeInTheDocument();
});
it("removes an area already bound when Done is pressed with nothing painted", () => {
  const done = vi.fn(); render(<AreaEditPanel version={version} sourceUrl="/source.png" saved onDone={done} />);
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(done).toHaveBeenCalledWith(undefined);
});
it("shows a close button only where the host gives one (the phone; Focus closes itself)", () => {
  const close = vi.fn(); const view = render(<AreaEditPanel version={version} sourceUrl="/source.png" onDone={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Close area editor" })).not.toBeInTheDocument();
  view.rerender(<AreaEditPanel version={version} sourceUrl="/source.png" onDone={vi.fn()} onClose={close} />);
  fireEvent.click(screen.getByRole("button", { name: "Close area editor" }));
  expect(close).toHaveBeenCalledOnce();
});
it("refuses a selection attached to another immutable picture until explicit redraw", () => {
  const done = vi.fn(); const initialMask = ProjectAreaMaskSchema.parse({ versionId: "version_other", width: 1200, height: 800, transform: "identity", dataUri: "data:image/png;base64,YQ==" });
  render(<AreaEditPanel version={version} sourceUrl="/source.png" initialMask={initialMask} onDone={done} />);
  expect(screen.getByRole("alert")).toHaveTextContent("different picture or size"); expect(screen.queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
  fireEvent.pointerUp(screen.getByTestId("paint")); expect(done).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Redraw selection" })); expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
});
it("cannot rebind a just-painted mask to another source when the host changes the viewed version", () => {
  const done = vi.fn(); const view = render(<AreaEditPanel version={version} sourceUrl="/source.png" onDone={done} />);
  fireEvent.pointerUp(screen.getByTestId("paint")); expect(screen.getByRole("button", { name: "Done" })).not.toBeDisabled();
  const other = MediaVersionSchema.parse({ ...version, id: "version_other_source" });
  view.rerender(<AreaEditPanel version={other} sourceUrl="/other.png" onDone={done} />);
  expect(screen.getByRole("button", { name: "Done" })).toBeDisabled(); fireEvent.click(screen.getByRole("button", { name: "Done" })); expect(done).not.toHaveBeenCalled();
  fireEvent.pointerUp(screen.getByTestId("paint")); fireEvent.click(screen.getByRole("button", { name: "Done" })); expect(done).toHaveBeenCalledWith(expect.objectContaining({ versionId: other.id }));
});
