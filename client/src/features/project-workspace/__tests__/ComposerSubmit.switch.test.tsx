import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ComposerSubmit } from "../components/ComposerSubmit";
import { composerOutput } from "@shared/workflow/actionRegistry";

afterEach(cleanup);

it("switches between Video and Image beside the primary without dispatching a request", () => {
  const onActionChange = vi.fn(); const onSubmit = vi.fn();
  render(<ComposerSubmit action="make-video" label="Make video" writable canSubmit={false} busy={false} onActionChange={onActionChange} onSubmit={onSubmit} />);
  expect(screen.getByRole("radiogroup", { name: "Output" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Video" })).toHaveAttribute("aria-checked", "true");
  fireEvent.click(screen.getByRole("radio", { name: "Image" }));
  expect(onActionChange).toHaveBeenCalledWith("make-image");
  fireEvent.click(screen.getByRole("radio", { name: "Video" }));
  expect(onActionChange).toHaveBeenCalledTimes(1);
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Choose action" })).not.toBeInTheDocument();
});

it("moves the selection with the arrow keys from the one focusable option", () => {
  const onActionChange = vi.fn();
  render(<ComposerSubmit action="make-image" label="Make image" writable canSubmit busy={false} onActionChange={onActionChange} onSubmit={vi.fn()} />);
  const image = screen.getByRole("radio", { name: "Image" });
  expect(image).toHaveAttribute("tabindex", "0");
  expect(screen.getByRole("radio", { name: "Video" })).toHaveAttribute("tabindex", "-1");
  fireEvent.keyDown(image, { key: "ArrowLeft" });
  expect(onActionChange).toHaveBeenCalledWith("make-video");
});

it("treats an animation, an edit and an extension as video, and a picture edit as image", () => {
  expect((["make-video", "animate-image", "edit-video", "extend-video"] as const).map(composerOutput)).toEqual(["video", "video", "video", "video"]);
  expect((["make-image", "edit-image"] as const).map(composerOutput)).toEqual(["image", "image"]);
  expect(composerOutput("ask")).toBeUndefined();
});

it("offers Video, Image, Voiceover and Music, Video first", () => {
  const onActionChange = vi.fn();
  render(<ComposerSubmit action="make-video" label="Make video" writable canSubmit busy={false} onActionChange={onActionChange} onSubmit={vi.fn()} />);
  expect(screen.getAllByRole("radio").map(radio => radio.textContent)).toEqual(["Video", "Image", "Voiceover", "Music"]);
  fireEvent.click(screen.getByRole("radio", { name: "Voiceover" }));
  expect(onActionChange).toHaveBeenCalledWith("make-voiceover");
});

it("hides the switch on a rail tool, keeping only its primary", () => {
  render(<ComposerSubmit action="upscale-image" label="Upscale image" writable canSubmit busy={false} onActionChange={vi.fn()} onSubmit={vi.fn()} />);
  expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Upscale image" })).toBeEnabled();
});

it("keeps the switch inert in read-only work", () => {
  const onActionChange = vi.fn(); const onSubmit = vi.fn();
  render(<ComposerSubmit action="animate-image" label="Make video" writable={false} canSubmit={false} busy={false} onActionChange={onActionChange} onSubmit={onSubmit} />);
  expect(screen.getByRole("radio", { name: "Video" })).toHaveAttribute("aria-checked", "true");
  for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
  fireEvent.click(screen.getByRole("radio", { name: "Image" }));
  expect(onActionChange).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Make video" })).toBeDisabled();
  expect(onSubmit).not.toHaveBeenCalled();
});

it("shows only the primary where the action cannot change", () => {
  render(<ComposerSubmit action="make-video" label="Make video" writable canSubmit busy={false} onSubmit={vi.fn()} />);
  expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Make video" })).toBeEnabled();
});
