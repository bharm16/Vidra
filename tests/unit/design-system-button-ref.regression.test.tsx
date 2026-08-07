import React from "react";
import { render, screen } from "@testing-library/react";
import { Button } from "@promptstudio/system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@promptstudio/system/components/ui/dropdown-menu";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Radix clones an `asChild` trigger and hands it a ref; the real design-system
 * Button is a `React.forwardRef`, so it accepts one. The shared jsdom test setup
 * substitutes a stand-in Button, and when that stand-in was a plain function
 * component the ref silently failed to attach — Radix could not anchor or focus
 * the trigger, and every menu test spent seconds retrying against the 10s
 * timeout instead of milliseconds. The suite went flaky under parallel load
 * rather than failing outright, which is why it survived so long.
 *
 * The invariant: whatever stands in for a design-system primitive must honour
 * the same ref contract as the component it replaces.
 */
describe("design-system Button ref contract (regression)", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("accepts a ref, so Radix can anchor an asChild trigger", () => {
    const ref = React.createRef<HTMLButtonElement>();

    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={ref} aria-label="Open menu">
            Open
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Only item</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(screen.getByLabelText("Open menu")).toBeInTheDocument();
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);

    const refWarnings = consoleError.mock.calls.filter((args) =>
      args.some(
        (arg) =>
          typeof arg === "string" &&
          arg.includes("Function components cannot be given refs"),
      ),
    );
    expect(refWarnings).toEqual([]);
  });
});
