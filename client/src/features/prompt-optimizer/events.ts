/**
 * The workspace's cross-feature broadcasts.
 *
 * "The creator started a new draft" has to reach state this feature does not
 * own — `generations` clears its jobs and media, the workspace clears its
 * generation controls. A window event is how that crosses the seam.
 *
 * Declared here rather than written as a string at each end: the name lived as
 * a bare `"po:workspace-reset"` literal in five production sites across two
 * features, so nothing connected a dispatcher to its listeners and a rename
 * would have gone silently one-way. Same shape as
 * `features/workspace-shell/events.ts`, which already does this for the
 * workspace's other two broadcasts.
 */

export const WORKSPACE_RESET = "po:workspace-reset" as const;

const supportsWindow = (): boolean => typeof window !== "undefined";

/** Announce that the working prompt was replaced by a fresh, empty draft. */
export function dispatchWorkspaceReset(): void {
  if (!supportsWindow()) return;
  window.dispatchEvent(new Event(WORKSPACE_RESET));
}

/** Listen for a workspace reset. Returns the unsubscribe. */
export function addWorkspaceResetListener(listener: () => void): () => void {
  if (!supportsWindow()) return () => {};

  const handler: EventListener = () => {
    listener();
  };

  window.addEventListener(WORKSPACE_RESET, handler);
  return () => {
    window.removeEventListener(WORKSPACE_RESET, handler);
  };
}
