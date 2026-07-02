import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "@promptstudio/system/components/ui";
import preset from "@promptstudio/system/tailwind.preset";

/**
 * Badge + overline type token contract (issue #50).
 *
 * Badge is the one status/label pill — neutral stays monochrome while
 * success/warning/danger tint from the --ps-badge-* tokens. The overline
 * fontSize entry is the only sanctioned uppercase micro-label treatment.
 */

describe("Badge", () => {
  it("renders children in a pill", () => {
    render(<Badge variant="success">Synced</Badge>);
    const badge = screen.getByText("Synced");
    expect(badge.className).toContain("rounded-full");
    expect(badge.className).toContain("border");
  });

  it("keeps the neutral variant monochrome", () => {
    render(<Badge variant="neutral">Queued</Badge>);
    const badge = screen.getByText("Queued");
    expect(badge.className).toContain("bg-transparent");
    expect(badge.className).toContain("text-muted");
  });

  it.each([
    ["success", "Verified"],
    ["warning", "Not verified"],
    ["danger", "Failed"],
  ] as const)("tints the %s variant from its badge tokens", (variant, text) => {
    render(<Badge variant={variant}>{text}</Badge>);
    const badge = screen.getByText(text);
    expect(badge.className).toContain(
      `bg-[color:var(--ps-badge-${variant}-bg)]`,
    );
    expect(badge.className).toContain(
      `border-[color:var(--ps-badge-${variant}-border)]`,
    );
    expect(badge.className).toContain(
      `text-[color:var(--ps-badge-${variant}-text)]`,
    );
  });

  it("never uppercases — casing belongs to the overline token", () => {
    render(<Badge variant="warning">Rendering</Badge>);
    const badge = screen.getByText("Rendering");
    expect(badge.className).not.toContain("uppercase");
  });
});

describe("overline type token", () => {
  it("exposes text-overline as an uppercase micro-label", () => {
    const fontSize =
      (
        preset as {
          theme?: {
            extend?: {
              fontSize?: Record<string, [string, Record<string, string>]>;
            };
          };
        }
      ).theme?.extend?.fontSize ?? {};

    const overline = fontSize["overline"];
    expect(overline, "preset fontSize.overline").toBeDefined();
    const [size, options] = overline as [string, Record<string, string>];
    expect(size).toBe("var(--ps-fs-10)");
    expect(options["textTransform"]).toBe("uppercase");
    expect(options["letterSpacing"]).toBe("var(--ps-ls-overline)");
    expect(options["fontWeight"]).toBe("var(--ps-fw-semibold)");
  });
});
