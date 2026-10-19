import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ContactSupportPage } from "../ContactSupportPage";

const { openDraft, copy } = vi.hoisted(() => ({ openDraft: vi.fn<(url: string) => void>(), copy: vi.fn<(value: string) => Promise<void>>() }));
vi.mock("@/hooks/useAuthUser", () => ({ useAuthUser: (options: { onChange?: (user: null) => void }): null => { const { onChange } = options; useEffect(() => { onChange?.(null); }, [onChange]); return null; } }));
vi.mock("@/features/public-site/support", async original => ({ ...await original<typeof import("@/features/public-site/support")>(), openSupportDraft: openDraft }));
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const originalMatchMedia = window.matchMedia;
beforeEach(() => { vi.clearAllMocks(); window.matchMedia = vi.fn(query => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(() => true) })); copy.mockResolvedValue(undefined); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } }); });
afterEach(() => { window.matchMedia = originalMatchMedia; if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard); else Reflect.deleteProperty(navigator, "clipboard"); });
function prepare(): void {
  render(<MemoryRouter><ContactSupportPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Please help me recover my clip." } });
  fireEvent.submit(screen.getByRole("form", { name: "Contact support form" }));
}

describe("Support email handoff recovery", () => {
  it("keeps the desktop action available for validation while invalid values never open the email draft", () => {
    render(<MemoryRouter><ContactSupportPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Your email (optional)"), { target: { value: "creator@" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Please help me recover my clip." } });
    fireEvent.click(screen.getByRole("button", { name: "Continue in email" }));
    expect(screen.getByRole("button", { name: "Continue in email" })).toBeEnabled();
    expect(screen.getByLabelText("Your email (optional)")).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByRole("button", { name: "Continue in email" }));
    expect(openDraft).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Message")).toHaveValue("Please help me recover my clip.");
    fireEvent.change(screen.getByLabelText("Your email (optional)"), { target: { value: "creator@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue in email" }));
    expect(openDraft).toHaveBeenCalledOnce();
  });
  it("requires correction of reported fields before enabling the mobile email handoff again", () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true, media: "(max-width: 767px)", onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() });
    render(<MemoryRouter><ContactSupportPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Your email (optional)"), { target: { value: "creator@" } });
    fireEvent.submit(screen.getByRole("form", { name: "Contact support form" }));
    expect(screen.getByRole("button", { name: "Continue in email" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Your email (optional)"), { target: { value: "still-invalid@" } });
    expect(screen.getByLabelText("Your email (optional)")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Continue in email" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Your email (optional)"), { target: { value: "creator@example.com" } });
    expect(screen.getByRole("button", { name: "Continue in email" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Continue in email" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Please help me recover my clip." } });
    expect(screen.getByRole("button", { name: "Continue in email" })).toBeEnabled();
    expect(openDraft).not.toHaveBeenCalled();
  });
  it("keeps the draft available when the email app and clipboard cannot be used", async () => {
    copy.mockRejectedValue(new Error("Clipboard denied"));
    prepare();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Vidra has not sent a support message.");
    fireEvent.click(within(dialog).getByRole("button", { name: "My email app did not open" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy email address" }));
    await waitFor(() => expect(dialog).toHaveAttribute("data-state-kind", "manual"));
    expect(screen.getByLabelText("Support email address")).toHaveAttribute("readonly");
    expect(dialog).toHaveTextContent("Clipboard access was blocked.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Back to support" }));
    expect(screen.getByLabelText("Message")).toHaveValue("Please help me recover my clip.");
    expect(openDraft).toHaveBeenCalledOnce();
  });
  it("copies only the displayed address and preserves the original email draft after closing", async () => {
    prepare();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "My email app did not open" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy email address" }));
    await waitFor(() => expect(dialog).toHaveAttribute("data-state-kind", "copied"));
    expect(copy).toHaveBeenCalledWith("support@vidra.app");
    expect(dialog).toHaveAttribute("data-state-kind", "copied");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.getByLabelText("Message")).toHaveValue("Please help me recover my clip.");
    const url = new URL(openDraft.mock.calls[0]?.[0] ?? "");
    expect(url.protocol).toBe("mailto:");
    expect(url.searchParams.get("body")).toContain("Please help me recover my clip.");
  });
});
