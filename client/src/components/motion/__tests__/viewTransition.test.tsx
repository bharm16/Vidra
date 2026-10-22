import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { useTransitionCommit, useTransitionLink } from "../viewTransition";

function Home(): ReactElement {
  const transitionLink = useTransitionLink();
  return <Link to="/next" onClick={transitionLink("reshape", "/next")}>Next</Link>;
}

function Next(): ReactElement {
  useTransitionCommit();
  return <h1>Next page</h1>;
}

const app = (): ReactElement => <MemoryRouter><Routes><Route path="/" element={<Home />} /><Route path="/next" element={<Next />} /></Routes></MemoryRouter>;

/** A stand-in for the browser: it runs the update and finishes once the update says the new screen is captured. */
function supportViewTransitions(): ReturnType<typeof vi.fn> {
  const start = vi.fn((update: () => Promise<void>) => {
    const done = update();
    return { finished: done, ready: Promise.resolve(), updateCallbackDone: done, skipTransition: vi.fn() };
  });
  Object.defineProperty(document, "startViewTransition", { configurable: true, value: start });
  return start;
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, "startViewTransition");
});

it("navigates inside a view transition that ends once the next screen has rendered", async () => {
  const start = supportViewTransitions();
  render(app());
  fireEvent.click(screen.getByRole("link", { name: "Next" }));
  expect(start).toHaveBeenCalledTimes(1);
  expect(document.documentElement.dataset.motionTransition).toBe("reshape");
  expect(await screen.findByRole("heading", { name: "Next page" })).toBeInTheDocument();
  await waitFor(() => expect(document.documentElement.dataset.motionTransition).toBeUndefined());
});

it("leaves a click that opens a new tab to the browser", () => {
  const start = supportViewTransitions();
  render(app());
  // Runs after React's handlers: records whether the app kept the browser's behaviour, then spares jsdom the navigation.
  let kept: boolean | undefined;
  document.addEventListener("click", event => { kept = !event.defaultPrevented; event.preventDefault(); }, { once: true });
  fireEvent.click(screen.getByRole("link", { name: "Next" }), { metaKey: true });
  expect(kept).toBe(true);
  expect(start).not.toHaveBeenCalled();
  expect(screen.queryByRole("heading", { name: "Next page" })).not.toBeInTheDocument();
});

it("navigates as a plain link where view transitions are missing", () => {
  render(app());
  fireEvent.click(screen.getByRole("link", { name: "Next" }));
  expect(screen.getByRole("heading", { name: "Next page" })).toBeInTheDocument();
  expect(document.documentElement.dataset.motionTransition).toBeUndefined();
});
