import { useSyncExternalStore } from "react";

const COMPACT_WIDTH = 768;
const readCompactViewport = (): boolean => window.innerWidth < COMPACT_WIDTH;
const readServerViewport = (): boolean => false;
const subscribe = (listener: () => void): (() => void) => {
  window.addEventListener("resize", listener);
  return () => window.removeEventListener("resize", listener);
};

/** Responsive chrome without changing the user's working state. */
export function useCompactViewport(): boolean {
  return useSyncExternalStore(subscribe, readCompactViewport, readServerViewport);
}
