import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { Alert, Badge } from "@promptstudio/system/components/ui";
import preset from "@promptstudio/system/tailwind.preset";

/**
 * Badge + overline type token contract (issue #50), plus two emission-level
 * regressions: Alert status tints must use the --ps-badge-* arbitrary-value
 * pattern (alpha modifiers like bg-danger/5 silently emit no CSS because the
 * preset colors carry no <alpha-value>), and text-overline must actually
 * emit text-transform: uppercase (the fontSize tuple's textTransform is
 * dropped by Tailwind's fontSize plugin).
 */

async function compileUtilities(rawHtml: string): Promise<string> {
  const result = await postcss([
    tailwindcss({
      presets: [preset as never],
      corePlugins: { preflight: false },
      content: [{ raw: rawHtml, extension: "html" }],
    }),
  ]).process("@tailwind utilities;", { from: undefined });
  return result.css;
}

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

describe("Alert status tints", () => {
  it.each([
    ["info", "info"],
    ["success", "success"],
    ["warning", "warning"],
    ["error", "danger"],
  ] as const)(
    "tints the %s variant from the --ps-badge-%s tokens",
    (variant, token) => {
      render(<Alert variant={variant}>Heads up</Alert>);
      const alert = screen.getByRole("alert");
      expect(alert.className).toContain(
        `bg-[color:var(--ps-badge-${token}-bg)]`,
      );
      expect(alert.className).toContain(
        `border-[color:var(--ps-badge-${token}-border)]`,
      );
    },
  );

  it("never uses alpha-modifier color classes — they emit no CSS under this preset", async () => {
    for (const variant of ["info", "success", "warning", "error"] as const) {
      const { unmount } = render(<Alert variant={variant}>Heads up</Alert>);
      const alert = screen.getByRole("alert");
      // bg-danger/5, border-success/30, … silently produce nothing because
      // the preset colors are plain var(--ps-*) values without <alpha-value>.
      expect(alert.className).not.toMatch(
        /(?:bg|border)-(?:danger|success|warning|info)\/\d+/,
      );
      unmount();
    }

    // Pin the environment fact that motivates the rule: an alpha-modified
    // preset color emits no utility at all.
    const css = await compileUtilities('<div class="bg-danger/5"></div>');
    expect(css).not.toContain("bg-danger\\/5");
  });

  it("emits real CSS for the badge-token classes Alert uses", async () => {
    const css = await compileUtilities(
      '<div class="border-[color:var(--ps-badge-danger-border)] bg-[color:var(--ps-badge-danger-bg)]"></div>',
    );
    expect(css).toContain("border-color: var(--ps-badge-danger-border)");
    expect(css).toContain("background-color: var(--ps-badge-danger-bg)");
  });
});

describe("overline type token", () => {
  it("emits text-transform: uppercase for text-overline", async () => {
    // The fontSize tuple's textTransform is dropped by Tailwind's fontSize
    // plugin; the preset's plugin utility must supply the uppercase so
    // consumers can keep sentence-case children.
    const css = await compileUtilities('<span class="text-overline"></span>');
    expect(css).toContain(".text-overline");
    expect(css).toMatch(/\.text-overline\s*\{[^}]*text-transform:\s*uppercase/);
  });

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
