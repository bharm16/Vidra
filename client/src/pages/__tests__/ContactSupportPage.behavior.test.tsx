import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ContactSupportPage } from "../ContactSupportPage";

const writeText = vi.fn();
const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);

beforeEach(() => {
  writeText.mockReset();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  if (originalClipboard)
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});

function renderPage(): void {
  render(
    <MemoryRouter>
      <ContactSupportPage />
    </MemoryRouter>,
  );
}

function draftUrl(): URL {
  return new URL(
    screen
      .getByRole("form", { name: "Contact support form" })
      .getAttribute("action") ?? "",
  );
}

describe("ContactSupportPage draft and copy contract", () => {
  it("encodes the selected security topic, optional reply address and multiline message into the mail draft", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Security report" }));
    fireEvent.change(screen.getByLabelText("Your email (optional)"), {
      target: { value: " creator@example.com " },
    });
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Problem & expected result?\nA second line + symbols" },
    });
    const draft = draftUrl();
    expect(draft.protocol).toBe("mailto:");
    expect(draft.pathname).toBe("support@vidra.app");
    expect(draft.searchParams.get("subject")).toBe("Security report");
    expect(draft.searchParams.get("body")).toContain(
      "From: creator@example.com\nTopic: security",
    );
    expect(draft.searchParams.get("body")).toContain(
      "Problem & expected result?\nA second line + symbols",
    );
    expect(
      screen.getByRole("button", { name: "Security report" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Support request" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("accepts an omitted reply address and rejects an invalid nonempty email through native form validation", () => {
    renderPage();
    const field = screen.getByLabelText("Your email (optional)");
    expect(field).toBeValid();
    expect(draftUrl().searchParams.get("body")).toContain("From: [your email]");
    fireEvent.change(field, { target: { value: "invalid-address" } });
    expect(field).toBeInvalid();
  });

  it("keeps Copy available after clipboard denial and only reports Copied after a successful write", async () => {
    writeText
      .mockRejectedValueOnce(new Error("Clipboard denied"))
      .mockResolvedValueOnce(undefined);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Copy email" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole("button", { name: "Copied" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy email" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeVisible();
    expect(writeText).toHaveBeenLastCalledWith("support@vidra.app");
  });

  it("uses the configured mailbox and preserves app, docs and legal destinations", () => {
    vi.stubEnv("VITE_SUPPORT_EMAIL", " help@vidra.app ");
    renderPage();
    expect(draftUrl().pathname).toBe("help@vidra.app");
    expect(screen.getByRole("link", { name: "Back to app" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByRole("link", { name: "Browse the docs" }),
    ).toHaveAttribute("href", "/docs");
    expect(
      screen.getByRole("link", { name: "Privacy policy" }),
    ).toHaveAttribute("href", "/privacy-policy");
    expect(
      screen.getByRole("link", { name: "Terms of service" }),
    ).toHaveAttribute("href", "/terms-of-service");
  });
});
