import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { MediaViewer } from "../components/MediaViewer";

vi.unmock("@promptstudio/system/components/ui/dialog");
vi.unmock("@promptstudio/system/components/ui/popover");

const version = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_glyph_picture", ownerId: "creator", projectId: "project_glyph", kind: "image", label: "Stadium", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "unknown", assetId: "picture", storagePath: "users/creator/picture.png" }, metadata: { state: "verified", width: 1344, height: 768, durationSeconds: 0, audio: "absent", probeVersion: "test" }, association: "linked", createdAt: "2026-10-17T00:00:00.000Z" });
const access = async (): Promise<{ url: string }> => ({ url: "/controlled-picture.png" });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("uses the mobile history glyph while preserving the versions callback and selected media", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true, media: "(width < 768px)", onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }));
  const user = userEvent.setup();
  const onVersions = vi.fn(), onUseInput = vi.fn(), onReuseSetup = vi.fn();
  const before = JSON.stringify(version);
  render(<MediaViewer version={version} access={access} onUseInput={onUseInput} onReuseSetup={onReuseSetup} canReuseSetup={false} onVersions={onVersions} />);
  await user.click(screen.getByRole("button", { name: "Media actions" }));
  const sheet = await screen.findByRole("dialog", { name: "Media actions" });
  const action = within(sheet).getByRole("button", { name: "View versions" });
  expect(action.querySelector("img")).toHaveAttribute("src", "/design-assets/fidelity-media-history-mobile.svg");
  await user.click(action);
  expect(onVersions).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog", { name: "Media actions" })).not.toBeInTheDocument();
  expect(onUseInput).not.toHaveBeenCalled();
  expect(onReuseSetup).not.toHaveBeenCalled();
  expect(JSON.stringify(version)).toBe(before);
});

it("preserves desktop history and marks only intrinsically muted unavailable utility glyphs", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, media: "(width < 768px)", onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }));
  const user = userEvent.setup(); const onVersions = vi.fn();
  render(<MediaViewer version={version} access={access} onUseInput={vi.fn()} onReuseSetup={vi.fn()} canReuseSetup={false} onVersions={onVersions} onPreferred={vi.fn()} preferredVersionId={version.id} />);
  await user.click(screen.getByRole("button", { name: "Use" }));
  const menu = document.querySelector(".vf-use-menu");
  if (!(menu instanceof HTMLElement)) throw new Error("Missing use menu");
  await user.click(within(menu).getByRole("button", { name: "Media actions" }));
  expect(within(menu).getByRole("button", { name: "View versions" }).querySelector("img")).toHaveAttribute("src", "/design-assets/fidelity-media-history.svg");
  const preferred = within(menu).getByRole("button", { name: "Preferred" });
  expect(preferred).toBeDisabled();
  expect(preferred.querySelector("img")).not.toHaveAttribute("data-muted");
  await user.click(within(menu).getByRole("button", { name: "Image tools" }));
  for (const name of ["Remove background", "Vectorize image"]) {
    const action = within(menu).getByRole("button", { name });
    expect(action).toBeDisabled();
    expect(action.querySelector("img")).toHaveAttribute("data-muted", "true");
  }
  expect(onVersions).not.toHaveBeenCalled();
});

it("names an uploaded picture under its mobile preview and keeps the caption out of the full viewer", () => {
  const { rerender } = render(<MediaViewer version={{ ...version, label: "Desk reference" }} access={access} onUseInput={vi.fn()} onReuseSetup={vi.fn()} canReuseSetup={false} mobilePreview />);
  expect(screen.getByText("Desk reference · v1")).toHaveClass("vf-mobile-picture-caption");
  rerender(<MediaViewer version={{ ...version, label: "Desk reference" }} access={access} onUseInput={vi.fn()} onReuseSetup={vi.fn()} canReuseSetup={false} />);
  expect(screen.queryByText("Desk reference · v1")).not.toBeInTheDocument();
});

it("offers Edit a region for pictures and Extend for clips under Use", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, media: "(width < 768px)", onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }));
  const user = userEvent.setup(); const onEditRegion = vi.fn(), onExtend = vi.fn();
  const picture = render(<MediaViewer version={version} access={access} onUseInput={vi.fn()} onReuseSetup={vi.fn()} canReuseSetup={false} onEditRegion={onEditRegion} onExtend={onExtend} />);
  await user.click(screen.getByRole("button", { name: "Use" }));
  const region = await screen.findByRole("button", { name: "Edit a region" });
  expect(region.querySelector("img")).toHaveAttribute("src", "/design-assets/fidelity-media-area.svg");
  expect(screen.queryByRole("button", { name: "Extend" })).not.toBeInTheDocument();
  await user.click(region);
  expect(onEditRegion).toHaveBeenCalledWith(version);
  picture.unmount();
  const clip = MediaVersionSchema.parse({ ...version, id: "version_glyph_clip", kind: "video", label: "Run", metadata: { ...version.metadata, durationSeconds: 8 } });
  render(<MediaViewer version={clip} access={access} onUseInput={vi.fn()} onReuseSetup={vi.fn()} canReuseSetup={false} onEditRegion={onEditRegion} onExtend={onExtend} />);
  await user.click(screen.getByRole("button", { name: "Use" }));
  const extend = await screen.findByRole("button", { name: "Extend" });
  expect(extend.querySelector("img")).toHaveAttribute("src", "/design-assets/fidelity-media-extend.svg");
  expect(screen.queryByRole("button", { name: "Edit a region" })).not.toBeInTheDocument();
  await user.click(extend);
  expect(onExtend).toHaveBeenCalledWith(clip);
});
