import { useLayoutEffect, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate, type NavigateOptions, type To } from "react-router-dom";
import { spring } from "./easing";
import { reducedMotion } from "./play";

/**
 * View Transitions carry a surface across changes that remount it, such as the auth card
 * moving between routes. The kind selects that transition's Figma timings in CSS; under
 * reduced motion every kind is marked "reduced" and only cross-fades.
 */
export type TransitionKind = "reshape" | "switch-right" | "switch-left";

/** A destination that has not rendered by then is captured as it stands, so the page never stays frozen. */
const COMMIT_LIMIT_MS = 500;

let running = 0;
let commit: (() => void) | undefined;

function supported(): boolean {
  return typeof document.startViewTransition === "function";
}

/** Marks the transition for CSS, with its springs and any timing it varies, until it finishes. */
function start(kind: TransitionKind, update: () => void | Promise<void>, variables: Record<string, string> = {}): void {
  const root = document.documentElement;
  const id = ++running;
  const properties = { "--m-spring-b10": spring(0.1), "--m-spring-b12": spring(0.12), ...variables };
  root.dataset.motionTransition = reducedMotion() ? "reduced" : kind;
  for (const [name, value] of Object.entries(properties)) root.style.setProperty(name, value);
  const clear = (): void => {
    if (id !== running) return;
    delete root.dataset.motionTransition;
    for (const name of Object.keys(properties)) root.style.removeProperty(name);
  };
  document.startViewTransition(update).finished.then(clear, clear);
}

/** Runs an in-page change as a view transition; without support it simply happens. */
export function transition(kind: TransitionKind, update: () => void, variables?: Record<string, string>): void {
  if (!supported()) {
    update();
    return;
  }
  start(kind, () => flushSync(update), variables);
}

/**
 * The click handler for a link whose destination arrives through a view transition. React
 * Router's own `viewTransition` only reaches routes declared on the data router, and these
 * pages render in nested <Routes>. Clicks that open a new tab or window keep the browser's
 * behaviour.
 */
export function useTransitionLink(): (kind: TransitionKind, to: To, options?: NavigateOptions, variables?: () => Record<string, string>) => (event: MouseEvent<HTMLAnchorElement>) => void {
  const navigate = useNavigate();
  return (kind, to, options, variables) => event => {
    if (!supported() || event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    start(kind, () => new Promise<void>(resolve => {
      const done = (): void => { clearTimeout(limit); commit = undefined; resolve(); };
      const limit = setTimeout(done, COMMIT_LIMIT_MS);
      commit = done;
      void navigate(to, options);
    }), variables?.());
  };
}

/** Lets a navigation's view transition capture this screen once it has rendered. */
export function useTransitionCommit(): void {
  const { key } = useLocation();
  useLayoutEffect(() => { commit?.(); }, [key]);
}
