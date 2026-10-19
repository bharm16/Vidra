import { useEffect, useState, type ComponentType } from "react";
import type { DocsBodyProps } from "./DocsBody";
import type { DocArticle } from "./articles";
import { reloadDocsModules, type DocsRetryView } from "./moduleRecovery";

export interface DocsDependencies {
  loadContent: () => Promise<{ DocsBody: ComponentType<DocsBodyProps> }>;
  loadSearch: () => Promise<{ searchDocIndex: (query: string) => DocArticle[] }>;
  resetModuleCache?: (view: DocsRetryView) => void;
}

/** Real, same-origin build chunks; navigation remains mounted if either import fails. */
export const DEFAULT_DOCS_DEPENDENCIES: DocsDependencies = {
  loadContent: async () => import("./DocsBody"),
  loadSearch: async () => import("./searchIndex"),
  resetModuleCache: reloadDocsModules,
};

type ContentState = { status: "loading" | "error" } | { status: "ready"; Content: ComponentType<DocsBodyProps> };
type SearchState = { status: "loading" | "error" } | { status: "ready"; search: (query: string) => DocArticle[] };
interface ContentResource { state: ContentState; retry: () => void }
interface SearchResource { state: SearchState; retry: () => void }

export function useDocsContent(enabled: boolean, load: DocsDependencies["loadContent"]): ContentResource {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ContentState>({ status: "loading" });
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    setState({ status: "loading" });
    void load().then(module => {
      if (current) setState({ status: "ready", Content: module.DocsBody });
    }).catch(() => {
      if (current) setState({ status: "error" });
    });
    return () => { current = false; };
  }, [enabled, load, attempt]);
  return { state, retry: () => setAttempt(value => value + 1) };
}

export function useDocsSearch(open: boolean, load: DocsDependencies["loadSearch"]): SearchResource {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SearchState>({ status: "loading" });
  useEffect(() => {
    if (!open) return;
    let current = true;
    setState({ status: "loading" });
    void load().then(module => {
      if (current) setState({ status: "ready", search: module.searchDocIndex });
    }).catch(() => {
      if (current) setState({ status: "error" });
    });
    return () => { current = false; };
  }, [open, load, attempt]);
  return { state, retry: () => setAttempt(value => value + 1) };
}
