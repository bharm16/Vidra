import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CapabilityProfileSchema } from "@shared/schemas/workflow/capability.schemas";
import { GuestDraftStore } from "@/repositories/workflow/GuestDraftStore";
import { GuestWorkspace } from "../GuestWorkspace";

vi.mock("@/features/span-highlighting/hooks/useSpanLabeling", () => ({ useSpanLabeling: () => ({ status: "idle", refresh: vi.fn() }) }));
const profile = CapabilityProfileSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "controlled", revision: "1", label: "Available model", action: "make-image", provider: "controlled", endpoint: "controlled/picture", mode: "text-to-image", availability: "qualified", inputs: [], output: { kind: "image", maxCount: 1 }, maxContextCharacters: 32000, parameters: {}, recovery: { start: "supported", status: "supported", cancel: "supported", result: "supported", deadlineSeconds: 600 }, generatedAudio: "unsupported", pricing: { mode: "free", maximumCreditsPerSlot: 0 } });
const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: [profile] }), { status: 200, headers: { "content-type": "application/json" } }));

function Location(): React.ReactElement { const location = useLocation(); return <p data-testid="location">{location.pathname}{location.search}</p>; }
function renderGuest(path = "/app"): void {
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/app" element={<GuestWorkspace />} /><Route path="*" element={<Location />} /></Routes></MemoryRouter>);
}
beforeEach(() => { localStorage.clear(); vi.stubGlobal("fetch", fetchMock); fetchMock.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("lets a signed-out visitor write a request and keeps the words on this device", async () => {
  renderGuest();
  fireEvent.change(screen.getByLabelText("Current request words"), { target: { value: "A lighthouse at dusk" } });
  expect(new GuestDraftStore().read()?.instructions).toBe("A lighthouse at dusk");
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(fetchMock.mock.calls.map(call => String((call as unknown[])[0]))).toEqual(["/api/public/workflow/profiles"]);
});

it("asks for an account when the visitor makes something, carrying a claim for the kept words", async () => {
  const video = CapabilityProfileSchema.parse({ ...profile, id: "controlled-video", label: "Video model", action: "make-video", endpoint: "controlled/video", mode: "text-to-video", inputs: [{ role: "reference", kinds: ["image"], minCount: 0, maxCount: 3 }], output: { kind: "video", maxCount: 1 } });
  fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ success: true, data: [profile, video] }), { status: 200, headers: { "content-type": "application/json" } }));
  renderGuest("/app?intent=make-video");
  fireEvent.change(screen.getByLabelText("Current request words"), { target: { value: "Waves at night" } });
  fireEvent.click(await screen.findByRole("button", { name: "Reference" }));
  const kept = new GuestDraftStore().read();
  expect(kept).toMatchObject({ action: "make-video", instructions: "Waves at night" });
  expect(screen.getByTestId("location")).toHaveTextContent(`/signup?redirect=${encodeURIComponent(`/app?claim=${kept?.id}`)}`);
});

it("starts a new visitor on Make video", () => {
  renderGuest();
  fireEvent.change(screen.getByLabelText("Current request words"), { target: { value: "Waves at night" } });
  expect(new GuestDraftStore().read()?.action).toBe("make-video");
  expect(screen.getByRole("button", { name: "Make video" })).toBeInTheDocument();
});

it("restores kept words when the visitor comes back before signing in", () => {
  renderGuest();
  fireEvent.change(screen.getByLabelText("Current request words"), { target: { value: "Kept words" } });
  cleanup();
  renderGuest();
  expect(screen.getByLabelText("Current request words")).toHaveValue("Kept words");
});

it("starts each output on Auto and keeps a visitor's chosen model across switches", async () => {
  renderGuest();
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(await screen.findByRole("button", { name: "Model: Auto" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "Image" }));
  fireEvent.click(await screen.findByRole("button", { name: "Model: Auto" }));
  fireEvent.click(await screen.findByRole("button", { name: "Available model" }));
  expect(await screen.findByRole("button", { name: "Model: Available model" })).toBeInTheDocument();
  expect(new GuestDraftStore().read()).toMatchObject({ action: "make-image", settings: { profileId: "controlled" } });
  fireEvent.click(screen.getByRole("radio", { name: "Video" }));
  expect(await screen.findByRole("button", { name: "Model: Auto" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "Image" }));
  expect(await screen.findByRole("button", { name: "Model: Available model" })).toBeInTheDocument();
});
