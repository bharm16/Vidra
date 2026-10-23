import { Fragment, type ReactElement } from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import { FreshButton, FreshIconButton, type FreshIconName } from "./FreshButton";

export type FreshDestination = "home" | "projects" | "create" | "media" | "video" | "sketch" | "upscale" | "reframe" | "captions" | "help" | "account";
/** Rail tools change existing media in the same composer (Rule 3); they are never output kinds. */
export type FreshTool = "upscale" | "reframe" | "captions";
const ITEMS: Array<{ key: Exclude<FreshDestination, "home">; label: string; icon: FreshIconName }> = [
  { key: "create", label: "New request", icon: "plus" },
  { key: "projects", label: "Open projects", icon: "folder" },
  { key: "media", label: "Project media", icon: "media" },
  { key: "video", label: "Video edits", icon: "video" },
  { key: "sketch", label: "Open Sketch", icon: "sketch" },
];
const TOOLS: Array<{ key: FreshTool; label: string; icon: FreshIconName }> = [
  { key: "upscale", label: "Upscale", icon: "upscale" },
  { key: "reframe", label: "Reframe", icon: "reframe" },
  { key: "captions", label: "Captions", icon: "captions" },
];

export function FreshRail({ active, onNavigate, onRequest, onProjectOptions, mobile = false, mobilePresentation = "icons", tools = false, requestPage = true }: {
  active: Exclude<FreshDestination, "home" | "help">;
  onNavigate(destination: FreshDestination): void;
  onRequest?(): void;
  onProjectOptions?(): void;
  mobile?: boolean;
  mobilePresentation?: "icons" | "labels";
  /** Shows the rail tools after Sketch; their active state follows the composer. */
  tools?: boolean;
  /** "New request" is the page only where a new request is written (the home); inside a conversation it stays highlighted but is an action. */
  requestPage?: boolean;
}): ReactElement {
  return <nav className="vf-rail vf-fresh-rail" data-mobile-nav={mobile || undefined} data-mobile-presentation={mobilePresentation} aria-label="Workspace navigation">
    {mobile && mobilePresentation === "labels" ? <div className="vf-mobile-label-navigation">{([{ destination: "create", label: "Chat" }, { destination: "media", label: "Media" }, { destination: "video", label: "Edits" }, { destination: "sketch", label: "Sketch" }] as const).map(item => <FreshButton key={item.destination} tone={active === item.destination ? "secondary" : "quiet"} aria-current={active === item.destination ? "page" : undefined} onClick={() => item.destination === "create" && onRequest ? onRequest() : onNavigate(item.destination)}>{item.label}</FreshButton>)}</div> : null}
    <Button variant="ghost" className="vf-brand !h-auto" aria-label="Vidra home" onClick={() => onNavigate("home")}>V</Button>
    {ITEMS.map(item => <Fragment key={item.key}><FreshIconButton className={mobile && item.key === "create" ? "vf-nav-create-desktop" : undefined} icon={item.icon} label={item.label} title={item.label} aria-current={active === item.key && (item.key !== "create" || requestPage) ? "page" : undefined} data-current={active === item.key || undefined} data-destination={item.key} onClick={() => onNavigate(item.key)} onContextMenu={event => { if (item.key === "projects" && onProjectOptions) { event.preventDefault(); event.currentTarget.focus(); onProjectOptions(); } }} onKeyDown={event => { if (item.key === "projects" && onProjectOptions && event.shiftKey && event.key === "F10") { event.preventDefault(); onProjectOptions(); } }} />{mobile && item.key === "create" ? <FreshIconButton className="vf-nav-create-mobile" icon="conversation" label="Request" title="Request" aria-current={active === "create" ? "page" : undefined} data-destination="create" onClick={() => onRequest ? onRequest() : onNavigate("create")} /> : null}</Fragment>)}
    {tools ? TOOLS.map(item => <FreshIconButton key={item.key} className="vf-rail-tool" icon={item.icon} label={item.label} title={item.label} aria-pressed={active === item.key} data-destination={item.key} onClick={() => onNavigate(item.key)} />) : null}
    <div className="vf-flex" />
    <FreshIconButton icon="help" label="Help" title="Help" data-destination="help" onClick={() => onNavigate("help")} />
    <FreshIconButton icon="account" label="Account" title="Account" aria-current={active === "account" ? "page" : undefined} data-destination="account" onClick={() => onNavigate("account")} />
  </nav>;
}
