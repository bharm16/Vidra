import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { User } from "@hooks/types";
import { AccountPage } from "../AccountPage";

const current = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
const retention = vi.hoisted(() => vi.fn());
const usage = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ signOut: vi.fn(), getCurrentUser: vi.fn(), sendVerificationEmail: vi.fn(), sendPasswordReset: vi.fn(), getSignInMethods: vi.fn(), updateDisplayName: vi.fn() }));
vi.mock("@hooks/useAuthUser", () => ({ useAuthUser: current }));
vi.mock("@repositories/index", () => ({ getAuthRepository: () => auth }));
vi.mock("@/repositories/workflow/WorkspaceRetention", () => ({ prepareWorkspaceSignOut: retention }));
vi.mock("../account/api/accountApi", () => ({ loadAccountUsage: usage }));
vi.mock("react-router-dom", async (importOriginal) => ({ ...(await importOriginal<typeof import("react-router-dom")>()), useNavigate: () => navigate }));
const signedIn = (overrides: Partial<User> = {}): User => ({ uid: "creator", email: "alex@vidra.test", displayName: "Alex Rivera", emailVerified: true, ...overrides });
function renderPage(path = "/account"): ReturnType<typeof render> { return render(<MemoryRouter initialEntries={[path]}><AccountPage /></MemoryRouter>); }
beforeEach(() => { vi.clearAllMocks(); current.mockReturnValue(signedIn()); auth.signOut.mockResolvedValue(undefined); auth.getCurrentUser.mockReturnValue(null); auth.sendVerificationEmail.mockResolvedValue(undefined); auth.sendPasswordReset.mockResolvedValue(undefined); auth.getSignInMethods.mockReturnValue(["password"]); retention.mockResolvedValue({ safe: true }); usage.mockResolvedValue({ resetAt: "2026-10-18T00:00:00.000Z", allowances: [], requests: [] }); });

describe("Retained account states", () => {
  it("checks retention before signing out and hides private identity while pending", async () => {
    let done: (() => void) | undefined;
    auth.signOut.mockImplementation(() => new Promise<void>(resolve => { done = resolve; }));
    renderPage(); fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByText("Signing out…");
    expect(retention).toHaveBeenCalledWith("creator", expect.arrayContaining([expect.objectContaining({ label: "an upload" }), expect.objectContaining({ label: "a video edit" }), expect.objectContaining({ label: "a Sketch picture" })]));
    expect(screen.queryByText("alex@vidra.test")).not.toBeInTheDocument();
    await act(async () => done?.());
    expect(navigate).toHaveBeenCalledWith("/signin", { replace: true });
  });
  it("guards unretained work without initiating provider signout", async () => {
    retention.mockResolvedValue({ safe: false, reason: "The latest draft could not be kept." });
    renderPage(); fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("The latest draft could not be kept.");
    expect(auth.signOut).not.toHaveBeenCalled();
  });
  it("returns to the exact owned unfinished draft without signing out or restoring different words", async () => {
    const target = { ownerId: "creator", projectId: "project_retained", conversationId: "conversation_retained", draftId: "draft_retained" };
    retention.mockResolvedValue({ safe: false, reason: "A device copy is retained.", canSignOutWithDeviceCopy: true, returnToDraft: target });
    function Destination(): React.ReactElement { const location = useLocation(); return <output data-testid="return-location">{JSON.stringify({ pathname: location.pathname, search: location.search, state: location.state })}</output>; }
    render(<MemoryRouter initialEntries={["/account"]}><AccountPage /><Destination /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    const link = within(await screen.findByRole("dialog")).getByRole("link", { name: "Return to draft" });
    expect(link.getAttribute("href")).toMatch(/^\/app\/project\/project_retained\?/);
    fireEvent.click(link);
    const destination = z.object({ pathname: z.string(), search: z.string(), state: z.unknown() }).parse(JSON.parse(screen.getByTestId("return-location").textContent ?? "{}"));
    expect(destination.pathname).toBe("/app/project/project_retained");
    expect(new URLSearchParams(destination.search).get("conversation")).toBe("conversation_retained");
    expect(destination.state).toMatchObject({ workspaceEntry: { kind: "reopen", ...target } });
    expect(auth.signOut).not.toHaveBeenCalled();
  });
  it("does not place a foreign draft destination into this owner's return link", async () => {
    retention.mockResolvedValue({ safe: false, reason: "Work could not be checked.", returnToDraft: { ownerId: "other", projectId: "private_project", conversationId: "private_conversation", draftId: "private_draft" } });
    renderPage(); fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("link", { name: "Return to draft" })).toHaveAttribute("href", "/app");
    expect(dialog.innerHTML).not.toContain("private_project");
    expect(auth.signOut).not.toHaveBeenCalled();
  });
  it("rechecks device retention before an explicit sign-out and keeps the account if that read fails", async () => {
    retention.mockResolvedValueOnce({ safe: false, reason: "A device copy is retained.", canSignOutWithDeviceCopy: true }).mockResolvedValue({ safe: false, reason: "Device work could not be checked." });
    renderPage(); fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(dialog).toHaveTextContent("Device work could not be checked."));
    expect(within(dialog).getByRole("button", { name: "Stay signed in" })).toBeVisible();
    expect(auth.signOut).not.toHaveBeenCalled();
  });
  it("signs out only after the owner explicitly confirms a freshly verified device copy", async () => {
    retention.mockResolvedValue({ safe: false, reason: "A device copy is retained.", canSignOutWithDeviceCopy: true });
    renderPage(); fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    const dialog = await screen.findByRole("dialog");
    expect(auth.signOut).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(auth.signOut).toHaveBeenCalledWith("creator"));
    expect(retention).toHaveBeenCalledTimes(2);
  });
  it("does not sign out a replacement account after a late confirmation read", async () => {
    let finish: ((value: { safe: false; reason: string; canSignOutWithDeviceCopy: true }) => void) | undefined;
    retention.mockResolvedValueOnce({ safe: false, reason: "A device copy is retained.", canSignOutWithDeviceCopy: true }).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = renderPage(); fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Sign out" }));
    current.mockReturnValue(signedIn({ uid: "other", displayName: "Other owner", email: "other@vidra.test" }));
    view.rerender(<MemoryRouter initialEntries={["/account"]}><AccountPage /></MemoryRouter>);
    await act(async () => finish?.({ safe: false, reason: "A device copy is retained.", canSignOutWithDeviceCopy: true }));
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Other owner" })).toBeVisible();
    expect(navigate).not.toHaveBeenCalled();
  });
  it("keeps the signed-in account when signout fails", async () => {
    auth.signOut.mockRejectedValue(new Error("offline"));
    renderPage(); fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be signed out");
    expect(screen.getByText("alex@vidra.test")).toBeVisible();
    expect(navigate).not.toHaveBeenCalled();
  });
  it("edits the name in place, validates it and retains a failed change", async () => {
    auth.updateDisplayName.mockRejectedValue(new Error("offline"));
    renderPage(); fireEvent.click(screen.getByRole("button", { name: "Edit name" }));
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert")).toHaveTextContent("1 to 80 characters");
    expect(auth.updateDisplayName).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: " New name " } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be saved");
    expect(screen.getByLabelText("Display name")).toHaveValue(" New name ");
    expect(auth.updateDisplayName).toHaveBeenCalledWith("creator", "New name");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();
  });
  it("does not reveal another owner's late name response", async () => {
    let complete: ((user: User) => void) | undefined;
    auth.updateDisplayName.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const view = renderPage(); fireEvent.click(screen.getByRole("button", { name: "Edit name" }));
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Private name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    current.mockReturnValue(signedIn({ uid: "other", displayName: "Other owner", email: "other@vidra.test" }));
    view.rerender(<MemoryRouter initialEntries={["/account"]}><AccountPage /></MemoryRouter>);
    await act(async () => complete?.(signedIn({ displayName: "Private name" })));
    expect(screen.getByRole("heading", { name: "Other owner" })).toBeVisible();
    expect(screen.queryByText("Private name")).not.toBeInTheDocument();
  });
  it("shows the verification cooldown only after delivery succeeds", async () => {
    current.mockReturnValue(signedIn({ emailVerified: false })); renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Resend verification" }));
    expect(await screen.findByRole("button", { name: /Resend in 60s/ })).toBeDisabled();
    expect(auth.sendVerificationEmail).toHaveBeenCalledWith("/account", "creator");
    expect(screen.getByText("A new verification link is on its way.").closest('[role="status"]')).toBeVisible();
  });
  it("uses the real provider and sends reset requests in place", async () => {
    renderPage("/account?section=security");
    fireEvent.click(screen.getByRole("button", { name: "Send password reset email" }));
    expect(await screen.findByText("Check your inbox for password reset instructions.")).toBeVisible();
    expect(auth.sendPasswordReset).toHaveBeenCalledWith("alex@vidra.test", "/account?section=security");
    expect(screen.getByRole("button", { name: "Send password reset email" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Send password reset email" }));
    expect(auth.sendPasswordReset).toHaveBeenCalledOnce();
  });
  it("does not offer an app password reset for a Google-only account", () => {
    auth.getSignInMethods.mockReturnValue(["google.com"]); renderPage("/account?section=security");
    expect(screen.queryByRole("button", { name: "Send password reset email" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Google account settings" })).toHaveAttribute("href", "https://myaccount.google.com/security");
  });
  it("shows no fabricated usage and retries a failed read", async () => {
    usage.mockRejectedValueOnce(new Error("offline")); renderPage("/account?section=usage");
    expect(await screen.findByRole("alert")).toHaveTextContent("Your allowance could not load.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Your accepted requests will appear here.")).toBeVisible();
    expect(screen.queryByText(/10 left|monthly pool|daily credits/i)).not.toBeInTheDocument();
    await waitFor(() => expect(usage).toHaveBeenCalledTimes(2));
  });
  it("refuses private account content for a signed-out visitor", () => {
    current.mockReturnValue(null); renderPage();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeVisible();
    expect(screen.queryByText("alex@vidra.test")).not.toBeInTheDocument();
    expect(usage).not.toHaveBeenCalled();
  });
});
