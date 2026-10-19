import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ComposerSubmit } from "../components/ComposerSubmit";

afterEach(cleanup);

it("opens the empty action chooser by keyboard without dispatching a request", async () => {
  const onActionChange = vi.fn(); const onSubmit = vi.fn();
  render(<ComposerSubmit action="make-image" label="Make image" writable hasProfile={false} canSubmit={false} busy={false} onActionChange={onActionChange} onSubmit={onSubmit} />);
  const chooser = screen.getByRole("button", { name: "Choose request action" });
  expect(chooser).toBeEnabled(); expect(chooser).toHaveAttribute("data-choosing", "true");
  fireEvent.keyDown(chooser, { key: "ArrowDown", altKey: true });
  fireEvent.click(await screen.findByRole("button", { name: "Make a video" }));
  expect(onActionChange).toHaveBeenCalledWith("make-video"); expect(onSubmit).not.toHaveBeenCalled();
});

it("makes the action chooser inert in read-only work", () => {
  const onActionChange = vi.fn(); const onSubmit = vi.fn();
  render(<ComposerSubmit action="make-image" label="Make image" writable={false} hasProfile={false} canSubmit={false} busy={false} onActionChange={onActionChange} onSubmit={onSubmit} />);
  const chooser = screen.getByRole("button", { name: "Choose request action" });
  expect(chooser).toBeDisabled(); fireEvent.click(chooser);
  expect(screen.queryByRole("button", { name: "Make a video" })).not.toBeInTheDocument();
  expect(onActionChange).not.toHaveBeenCalled(); expect(onSubmit).not.toHaveBeenCalled();
});
