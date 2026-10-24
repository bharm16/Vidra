import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { VersionShareSchema, PublicVersionSchema, type VersionShare } from "@shared/schemas/workflow/sharing.schemas";
import { OwnedSharesApi, PublicSharesApi, SharingApiError, type OwnedSharesPort, type PublicSharesPort } from "../api/sharingApi";
import { clearPublication, readPublication, writePublication } from "../checkpoint";
import { useVersionSharing } from "../hooks/useVersionSharing";
import { ShareVersionPanel } from "../ShareVersionPanel";
import { WorkflowSharePage } from "../WorkflowSharePage";

vi.mock("@/repositories/index", () => ({ getAuthRepository: () => ({ getCurrentUser: () => ({ uid: "creator" }) }) }));

const ID = "f6079012-0089-43be-a1ba-c6d3be995f22";
const OTHER_ID = "f6079012-0089-43be-a1ba-c6d3be995f23";
const SCOPE = { ownerId: "creator", projectId: "project_share", versionId: "version_picture" };
const NOW = new Date().toISOString();
function grant(overrides: Record<string, unknown> = {}): VersionShare { return VersionShareSchema.parse({ id: ID, ...SCOPE, sharingEpoch: 0, revoked: false, kind: "image", label: "A ready picture", createdAt: NOW, ...overrides }); }
function picture(): ReturnType<typeof MediaVersionSchema.parse> { return MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: SCOPE.versionId, ownerId: SCOPE.ownerId, projectId: SCOPE.projectId, kind: "image", label: "A ready picture", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "verified", assetId: "asset", storagePath: "users/creator/picture.png", generation: "1", sha256: "a".repeat(64), bytes: 100 }, metadata: { state: "verified", width: 640, height: 360, durationSeconds: 0, audio: "absent", probeVersion: "test" }, association: "linked", createdAt: NOW }); }
function publicVersion(id = ID): ReturnType<typeof PublicVersionSchema.parse> { return PublicVersionSchema.parse({ id, kind: "image", label: "A ready picture", url: new URL(`/api/public/workflow-shares/${id}/content`, window.location.origin).href, expiresAt: new Date(Date.now() + 60000).toISOString(), createdAt: NOW }); }
function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(status < 400 ? { success: true, data } : { error: "Denied" }), { status, headers: { "Content-Type": "application/json" } }); }
function ownerApi(): OwnedSharesPort { return { list: vi.fn().mockResolvedValue([]), publish: vi.fn(async (_projectId: string, _versionId: string, id: string): Promise<VersionShare> => grant({ id })), revoke: vi.fn().mockResolvedValue(grant({ revoked: true })), access: vi.fn().mockResolvedValue({ url: "https://example.test/picture.png" }) }; }
function Harness({ api }: { api: OwnedSharesPort }): React.ReactElement {
  const control = useVersionSharing(SCOPE, api);
  return <><output>{control.state.phase}</output><output>{control.state.pending?.id}</output><button onClick={() => { void control.publish(); }}>Publish</button><button onClick={() => { void control.revoke(); }}>Private</button></>;
}
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
beforeEach(() => { clearPublication(SCOPE); vi.restoreAllMocks(); });
afterEach(() => { if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard); else Reflect.deleteProperty(navigator, "clipboard"); });

describe("sharing API authority boundaries", () => {
  it("rejects another owner or project and a mismatched publication target", async () => {
    const rawRequest = vi.fn().mockResolvedValueOnce(json([grant({ ownerId: "someone-else" })])).mockResolvedValueOnce(json([grant({ projectId: "project_other" })])).mockResolvedValueOnce(json(grant({ versionId: "version_other" })));
    const api = new OwnedSharesApi("creator", { rawRequest });
    await expect(api.list(SCOPE.projectId)).rejects.toThrow();
    await expect(api.list(SCOPE.projectId)).rejects.toThrow();
    await expect(api.publish(SCOPE.projectId, SCOPE.versionId, ID)).rejects.toThrow();
  });
  it("keeps denied responses distinct and makes no automatic retry or alternate request", async () => {
    const rawRequest = vi.fn().mockResolvedValue(json(undefined, 401));
    await expect(new OwnedSharesApi("creator", { rawRequest }).list(SCOPE.projectId)).rejects.toMatchObject({ status: 401 });
    expect(rawRequest).toHaveBeenCalledTimes(1);
  });
  it("rejects public metadata leaks, a swapped target and external media URLs", async () => {
    const rawRequest = vi.fn().mockResolvedValueOnce(json({ ...publicVersion(), ownerId: "private-owner" })).mockResolvedValueOnce(json(publicVersion(OTHER_ID))).mockResolvedValueOnce(json({ ...publicVersion(), url: "https://external.test/private.png" }));
    const api = new PublicSharesApi({ rawRequest });
    await expect(api.resolve(ID)).rejects.toThrow(); await expect(api.resolve(ID)).rejects.toThrow(); await expect(api.resolve(ID)).rejects.toThrow();
    expect(rawRequest).toHaveBeenCalledTimes(3);
  });
  it("reports revoked content during download rather than producing a file", async () => {
    const rawRequest = vi.fn().mockResolvedValueOnce(json(publicVersion())).mockResolvedValueOnce(json(undefined, 404));
    await expect(new PublicSharesApi({ rawRequest }).download(ID)).rejects.toMatchObject({ status: 404 });
  });
  it("refuses a checkpoint from another account namespace", () => {
    writePublication({ ...SCOPE, id: ID });
    expect(readPublication({ ...SCOPE, ownerId: "someone-else" })).toBeUndefined();
  });
});

describe("exact-version owner sharing", () => {
  it("keeps one publication UUID after a lost response, closing and reopening", async () => {
    const api = ownerApi();
    const publish = vi.mocked(api.publish).mockRejectedValueOnce(new Error("Response lost"));
    const first = render(<Harness api={api} />);
    await screen.findByText("private"); fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await screen.findByText("error");
    const firstId = publish.mock.calls[0]?.[2];
    expect(firstId).toBeTruthy(); first.unmount();
    render(<Harness api={api} />); await screen.findByText("error");
    expect(publish).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Publish" })); await screen.findByText("published");
    expect(publish.mock.calls[1]?.[2]).toBe(firstId);
    expect(publish.mock.calls[1]?.slice(0, 2)).toEqual([SCOPE.projectId, SCOPE.versionId]);
  });
  it("reconciles a lost publication from the existing owned grant without publishing again", async () => {
    writePublication({ ...SCOPE, id: ID }); const api = ownerApi(); vi.mocked(api.list).mockResolvedValue([grant()]);
    render(<Harness api={api} />); await screen.findByText("published");
    expect(api.publish).not.toHaveBeenCalled(); expect(readPublication(SCOPE)).toBeUndefined();
  });
  it("turns off every active link for the exact version and trusts the reconciled outcome", async () => {
    const api = ownerApi(); const second = grant({ id: OTHER_ID });
    vi.mocked(api.list).mockResolvedValueOnce([grant(), second]).mockResolvedValueOnce([grant({ revoked: true }), { ...second, revoked: true }]);
    vi.mocked(api.revoke).mockRejectedValue(new Error("Response lost"));
    render(<Harness api={api} />); await screen.findByText("published");
    fireEvent.click(screen.getByRole("button", { name: "Private" })); await screen.findByText("private");
    expect(api.revoke).toHaveBeenCalledWith(SCOPE.projectId, ID); expect(api.revoke).toHaveBeenCalledWith(SCOPE.projectId, OTHER_ID);
  });
  it("never requests or exposes another account's version", () => {
    const api = ownerApi(); render(<ShareVersionPanel ownerId="someone-else" projectId={SCOPE.projectId} version={picture()} onClose={vi.fn()} api={api} />);
    expect(screen.getByText(/does not belong to the current account/)).toBeVisible(); expect(api.list).not.toHaveBeenCalled(); expect(api.access).not.toHaveBeenCalled();
  });
  it("dismisses from Escape outside the panel without changing sharing access", async () => {
    const api = ownerApi(); const onClose = vi.fn();
    render(<ShareVersionPanel ownerId={SCOPE.ownerId} projectId={SCOPE.projectId} version={picture()} onClose={onClose} api={api} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Who has access Only you" })).toBeEnabled());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    expect(api.publish).not.toHaveBeenCalled(); expect(api.revoke).not.toHaveBeenCalled();
  });
  it("only reports copied after clipboard success and supplies manual fallback on denial", async () => {
    const api = ownerApi(); vi.mocked(api.list).mockResolvedValue([grant()]);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) } });
    render(<ShareVersionPanel {...{ ownerId: SCOPE.ownerId, projectId: SCOPE.projectId }} version={picture()} onClose={vi.fn()} api={api} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy link" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await screen.findByRole("textbox", { name: "Share link" })).toHaveValue(new URL(`/share/media/${ID}`, window.location.origin).href);
    expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument();
  });
});

describe("clipboard availability", () => {
  it("offers manual copy when the Clipboard API is absent", async () => {
    const api = ownerApi(); vi.mocked(api.list).mockResolvedValue([grant()]);
    Reflect.deleteProperty(navigator, "clipboard");
    render(<ShareVersionPanel ownerId={SCOPE.ownerId} projectId={SCOPE.projectId} version={picture()} onClose={vi.fn()} api={api} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy link" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await screen.findByRole("textbox", { name: "Share link" })).toBeVisible();
  });
});

describe("public exact-target viewing", () => {
  it("clears the displayed version after canonical revocation without legacy lookup", async () => {
    const api: PublicSharesPort = { resolve: vi.fn().mockResolvedValueOnce(publicVersion()).mockRejectedValue(new SharingApiError("Missing", 404)), download: vi.fn() };
    render(<MemoryRouter><WorkflowSharePage shareId={ID} api={api} /></MemoryRouter>);
    expect(await screen.findByRole("img", { name: "A ready picture" })).toBeVisible();
    fireEvent.focus(window);
    expect(await screen.findByRole("heading", { name: "This link is no longer available" })).toBeVisible();
    expect(screen.queryByRole("img", { name: "A ready picture" })).not.toBeInTheDocument();
    expect(api.download).not.toHaveBeenCalled();
  });
  it("keeps network errors distinct and retries the original share identity", async () => {
    const api: PublicSharesPort = { resolve: vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(publicVersion()), download: vi.fn() };
    render(<MemoryRouter><WorkflowSharePage shareId={ID} api={api} /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "The shared file could not load" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("img", { name: "A ready picture" })).toBeVisible();
    expect(vi.mocked(api.resolve).mock.calls.map(call => call[0])).toEqual([ID, ID]);
  });
  it("clears private content when a download finds the grant revoked", async () => {
    const api: PublicSharesPort = { resolve: vi.fn().mockResolvedValue(publicVersion()), download: vi.fn().mockRejectedValue(new SharingApiError("Missing", 404)) };
    render(<MemoryRouter><WorkflowSharePage shareId={ID} api={api} /></MemoryRouter>);
    await screen.findByRole("img", { name: "A ready picture" }); fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(await screen.findByRole("heading", { name: "This link is no longer available" })).toBeVisible();
    expect(screen.queryByRole("img", { name: "A ready picture" })).not.toBeInTheDocument();
  });
});
