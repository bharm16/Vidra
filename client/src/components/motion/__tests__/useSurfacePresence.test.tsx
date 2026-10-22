import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { MENU_FOLD, MENU_GROW } from "../surface";
import { useSurfacePresence } from "../useSurfacePresence";

function Menu({ open }: { open: boolean }): ReactElement | null {
  const surface = useSurfacePresence(open, { origin: () => undefined, grow: MENU_GROW, fold: MENU_FOLD });
  return surface.present ? <div ref={surface.ref} style={{ backgroundColor: "rgb(26, 26, 26)" }}>Menu</div> : null;
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(Element.prototype, "animate");
});

it("closes at once where nothing can animate", () => {
  const { rerender } = render(<Menu open />);
  expect(screen.getByText("Menu")).toBeInTheDocument();
  rerender(<Menu open={false} />);
  expect(screen.queryByText("Menu")).not.toBeInTheDocument();
});

it("keeps a closing surface mounted until it has folded back", async () => {
  const finishes: Array<() => void> = [];
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    value: vi.fn((): Animation => {
      const finished = new Promise<Animation>(resolve => { finishes.push(() => resolve({} as Animation)); });
      return { finished, cancel: vi.fn() } as unknown as Animation;
    }),
  });
  const { rerender } = render(<Menu open />);
  await act(async () => { await Promise.resolve(); });
  rerender(<Menu open={false} />);
  expect(screen.getByText("Menu")).toBeInTheDocument();
  await act(async () => { for (const finish of finishes) finish(); await Promise.resolve(); });
  expect(screen.queryByText("Menu")).not.toBeInTheDocument();
});
