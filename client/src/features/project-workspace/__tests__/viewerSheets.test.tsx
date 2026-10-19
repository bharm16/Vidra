import { useState } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { MediaViewer } from "../components/MediaViewer";
import { VersionsPanel } from "../components/VersionsPanel";

vi.unmock("@promptstudio/system/components/ui/dialog");

const version = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_picture", ownerId: "creator", projectId: "project_picture", kind: "image", label: "Stadium", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "unknown", assetId: "picture", storagePath: "users/creator/picture.png" }, metadata: { state: "verified", width: 1344, height: 768, durationSeconds: 0, audio: "absent", probeVersion: "test" }, association: "linked", createdAt: "2026-10-17T00:00:00.000Z" });
const access = async (): Promise<{ url: string }> => ({ url: "/controlled-picture.png" });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("makes mobile media actions modal and returns Escape focus without choosing a media action", async () => {
  const user = userEvent.setup(); const onEdit = vi.fn(), onHide = vi.fn();
  render(<><button>Unrelated workspace action</button><MediaViewer version={version} access={access} onUseInput={vi.fn()} onReuseSetup={vi.fn()} canReuseSetup={false} onEdit={onEdit} onHide={onHide} /></>);
  const trigger = screen.getByRole("button", { name: "Media actions" });
  await user.click(trigger);
  expect(await screen.findByRole("dialog", { name: "Media actions" })).toHaveAttribute("aria-modal", "true");
  expect(screen.queryByRole("button", { name: "Unrelated workspace action" })).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Media actions" })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus(); expect(onEdit).not.toHaveBeenCalled(); expect(onHide).not.toHaveBeenCalled();
});

it("keeps mobile Versions modal, preserves selection on Escape and returns focus to its invoker", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true, media: "(width < 768px)", onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }));
  const user = userEvent.setup(); const onView = vi.fn(), onEdit = vi.fn(), onPreferred = vi.fn();
  function Fixture() { const [open, setOpen] = useState(false); return <><button onClick={() => setOpen(true)}>Open versions</button>{open ? <VersionsPanel versions={[version]} selectedVersionId={version.id} access={access} onView={onView} onEdit={onEdit} onPreferred={onPreferred} onClose={() => setOpen(false)} /> : null}</>; }
  render(<Fixture />); const trigger = screen.getByRole("button", { name: "Open versions" });
  await user.click(trigger);
  expect(await screen.findByRole("dialog", { name: "Versions" })).toHaveAttribute("aria-modal", "true");
  expect(screen.queryByRole("button", { name: "Open versions" })).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Versions" })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus(); expect(onView).not.toHaveBeenCalled(); expect(onEdit).not.toHaveBeenCalled(); expect(onPreferred).not.toHaveBeenCalled();
});

it("releases a mobile action sheet when its desktop presentation hides without choosing an action", async () => {
  let resize: (() => void) | undefined;
  const query = { matches: true, media: "(width < 768px)", onchange: null, addEventListener: vi.fn((_type: string, listener: () => void) => { resize = listener; }), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() };
  vi.stubGlobal("matchMedia", () => query);
  const user = userEvent.setup(); const onEdit = vi.fn(), onHide = vi.fn();
  render(<MediaViewer version={version} access={access} onUseInput={vi.fn()} onReuseSetup={vi.fn()} canReuseSetup={false} onEdit={onEdit} onHide={onHide} />);
  await user.click(screen.getByRole("button", { name: "Media actions" }));
  expect(await screen.findByRole("dialog", { name: "Media actions" })).toBeInTheDocument();
  await act(async () => { query.matches = false; resize?.(); });
  expect(screen.queryByRole("dialog", { name: "Media actions" })).not.toBeInTheDocument();
  expect(onEdit).not.toHaveBeenCalled(); expect(onHide).not.toHaveBeenCalled();
});
