import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@promptstudio/system/dialog";
import { FreshButton } from "@/components/fresh/FreshButton";
import { SiteLink, SiteShell } from "../SiteShell";
import { DOC_NAV_ARTICLES, DOC_GROUPS, findNavigationArticle } from "./navigation";
import { DEFAULT_DOCS_DEPENDENCIES, useDocsContent, useDocsSearch, type DocsDependencies } from "./useDocsModules";
import { clearDocsRecovery, readDocsRecovery } from "./moduleRecovery";
import "./docs.css";

const scrollPositions = new Map<string, number>();
const GUIDE_FRAME_HEIGHTS: Record<string, number> = { start: 1522, images: 1496, video: 1574, editor: 1548, imports: 1522, history: 1548, sketch: 1522, models: 1548, sharing: 1522, recovery: 1574, allowance: 1496, words: 1544, regions: 1496 };
const MOBILE_GUIDE_FRAME_HEIGHTS: Record<string, number> = { start: 1798, images: 1794, video: 1872, editor: 1898, imports: 1872, history: 1998, sketch: 1798, models: 1872, sharing: 1894, recovery: 1924, allowance: 1846, words: 1764, regions: 1742 };
function DocsNavigation({ current, query, onSearch, onNavigate }: { current: string | undefined; query: string; onSearch: () => void; onNavigate?: () => void }): ReactElement {
  const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
  return <nav className="vf-docs-navigation" aria-label="Documentation topics">
    <FreshButton tone="secondary" className="vf-docs-search-trigger" onClick={onSearch}><span>Search documentation</span><kbd>⌘ K</kbd></FreshButton>
    {DOC_GROUPS.map(group => <div className="vf-docs-group" key={group}>
      {group === "Start" ? <Link to={`/docs${suffix}`} aria-current={!current ? "page" : undefined} onClick={onNavigate}>Overview</Link> : <p>{group}</p>}
      {DOC_NAV_ARTICLES.filter(article => article.group === group).map(article => <Link to={`/docs/${article.slug}${suffix}`} key={article.slug} aria-current={current === article.slug ? "page" : undefined} onClick={onNavigate}>{article.label}</Link>)}
    </div>)}
  </nav>;
}

function DocsRouteMessage({ state, retry }: { state: "missing" | "loading" | "error"; retry: () => void }): ReactElement {
  const loading = state === "loading";
  return <main className="vf-docs-main vf-docs-missing"><section className="vf-system-message" role={loading ? "status" : state === "error" ? "alert" : undefined}>
    <img src={`/design-assets/public-${loading ? "loading" : "alert"}.svg`} alt="" width={32} height={32} className={loading ? "vf-system-spinner" : undefined} />
    <h1>{loading ? "Loading…" : state === "error" ? "This page could not load" : "We could not find that page"}</h1>
    {loading ? null : <p>{state === "error" ? "Try again. If it keeps happening, contact support." : "The link may have changed. Find what you need from the home page."}</p>}
    {state === "error" ? <FreshButton tone="primary" large onClick={retry}>Try again</FreshButton> : state === "missing" ? <SiteLink to="/" tone="primary">Go home</SiteLink> : null}
  </section></main>;
}

export function DocsPage({ dependencies = DEFAULT_DOCS_DEPENDENCIES }: { dependencies?: DocsDependencies } = {}): ReactElement {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const query = (params.get("q") ?? "").slice(0, 512);
  const slug = location.pathname === "/docs" || location.pathname === "/docs/" ? "" : location.pathname.slice("/docs/".length);
  const summary = findNavigationArticle(slug);
  const missing = Boolean(slug && !summary);
  const [recovery] = useState(readDocsRecovery);
  const [searchOpen, setSearchOpen] = useState(recovery?.searchOpen ?? false);
  const [menuOpen, setMenuOpen] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const previousPath = useRef(location.pathname);
  const content = useDocsContent(!missing, dependencies.loadContent);
  const search = useDocsSearch(searchOpen, dependencies.loadSearch);
  const results = search.state.status === "ready" ? search.state.search(query) : [];
  const Content = content.state.status === "ready" ? content.state.Content : undefined;
  const view = missing ? "missing" : content.state.status === "error" ? "error" : Content ? summary ? "article" : "home" : "loading";
  const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
  const retryDependency = (kind: "content" | "search"): void => {
    if (dependencies.resetModuleCache) {
      dependencies.resetModuleCache({ searchOpen: kind === "search", scrollTop: root.current?.closest<HTMLElement>(".vf-site")?.scrollTop ?? 0, windowScrollY: Math.max(0, window.scrollY) });
    } else if (kind === "search") search.retry();
    else content.retry();
  };
  const openSearch = (): void => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMenuOpen(false);
    setSearchOpen(true);
  };
  const changeQuery = (value: string): void => {
    const next = new URLSearchParams(params);
    if (value) next.set("q", value.slice(0, 512)); else next.delete("q");
    setParams(next, { replace: true });
  };
  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setMenuOpen(false);
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);
  useEffect(clearDocsRecovery, []);
  useEffect(() => {
    if (previousPath.current === location.pathname) return;
    previousPath.current = location.pathname;
    setSearchOpen(false); setMenuOpen(false);
  }, [location.pathname]);
  useLayoutEffect(() => {
    const scroller = root.current?.closest<HTMLElement>(".vf-site");
    if (!scroller || !Content) return;
    const restore = recovery?.route === location.pathname + location.search ? recovery : undefined;
    scroller.scrollTop = restore?.scrollTop ?? scrollPositions.get(location.pathname) ?? 0;
    if (restore) window.scrollTo(0, restore.windowScrollY);
    if (restore?.searchOpen) returnFocus.current = root.current?.querySelector<HTMLButtonElement>(window.matchMedia("(max-width: 767px)").matches ? ".vf-docs-mobile-controls > button:last-child" : ".vf-docs-search-trigger") ?? null;
    return () => { scrollPositions.set(location.pathname, scroller.scrollTop); };
  }, [location.pathname, location.search, Content, recovery]);

  return <SiteShell footer={Boolean(Content && !missing)}><div className="vf-docs-layout" data-docs-view={view} style={{ "--vf-docs-frame-height": `${summary ? GUIDE_FRAME_HEIGHTS[summary.slug] ?? 1522 : 1480}px`, "--vf-docs-mobile-frame-height": `${summary ? MOBILE_GUIDE_FRAME_HEIGHTS[summary.slug] ?? 1898 : 1651}px` } as CSSProperties} ref={root}>
    <aside className="vf-docs-desktop-navigation"><DocsNavigation current={summary?.slug} query={query} onSearch={openSearch} /></aside>
    <div className="vf-docs-mobile-controls"><FreshButton onClick={() => setMenuOpen(true)}>Docs menu</FreshButton><FreshButton onClick={openSearch}>Search</FreshButton></div>
    {missing ? <DocsRouteMessage state="missing" retry={() => retryDependency("content")} /> : view === "error" ? <DocsRouteMessage state="error" retry={() => retryDependency("content")} /> : Content ? <Content slug={summary?.slug ?? ""} query={query} /> : <DocsRouteMessage state="loading" retry={() => retryDependency("content")} />}
    <Dialog open={menuOpen} onOpenChange={setMenuOpen}><DialogContent className="vf vf-docs-sheet" overlayClassName="vf vf-site-overlay" aria-describedby={undefined} hideClose><div className="vf-docs-sheet-header"><DialogTitle>Documentation</DialogTitle><DialogClose asChild><FreshButton tone="quiet" aria-label="Close documentation"><img src="/design-assets/fidelity-public-close.svg" alt="" width={18} height={18} /></FreshButton></DialogClose></div><DocsNavigation current={summary?.slug} query={query} onSearch={openSearch} onNavigate={() => setMenuOpen(false)} /></DialogContent></Dialog>
    <Dialog open={searchOpen} onOpenChange={setSearchOpen}><DialogContent className="vf vf-docs-search" overlayClassName="vf vf-docs-search-overlay" aria-describedby={undefined} hideClose onCloseAutoFocus={event => { event.preventDefault(); returnFocus.current?.focus({ preventScroll: true }); }}>
      <DialogTitle className="sr-only">Search documentation</DialogTitle>
      <div className="vf-docs-search-field"><input aria-label="Search documentation" value={query} onChange={event => changeQuery(event.target.value)} placeholder="Search documentation" maxLength={512} /><DialogClose asChild><FreshButton tone="quiet" aria-label="Close search"><span className="vf-docs-wide-escape">Esc</span><img className="vf-docs-touch-close" src="/design-assets/fidelity-public-close.svg" alt="" width={18} height={18} /></FreshButton></DialogClose></div>
      <div className="vf-docs-results" data-search-status={search.state.status} aria-live="polite">{search.state.status === "error" ? <div className="vf-docs-search-error"><p>Search is unavailable right now.</p><FreshButton tone="quiet" onClick={() => retryDependency("search")}>Try again</FreshButton></div> : !query.trim() ? ["start", "editor", "recovery"].map(key => { const guide = findNavigationArticle(key); return guide ? <Link key={key} to={`/docs/${key}${suffix}`} onClick={() => setSearchOpen(false)}>{guide.title}</Link> : null; }) : search.state.status === "loading" ? <div role="status" aria-label="Loading search" /> : results.length ? results.map(result => <Link key={result.slug} to={`/docs/${result.slug}${suffix}`} onClick={() => setSearchOpen(false)}>{result.title}</Link>) : <div className="vf-docs-no-results"><p>No matching articles.</p><FreshButton tone="quiet" onClick={() => changeQuery("")}>Clear search</FreshButton></div>}</div>
    </DialogContent></Dialog>
  </div></SiteShell>;
}
