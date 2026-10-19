import { forwardRef, type ReactElement } from "react";
import { Button, type ButtonProps } from "@promptstudio/system/components/ui/button";
import "./fresh.css";

export interface FreshButtonProps extends Omit<ButtonProps, "variant"> {
  tone?: "primary" | "secondary" | "quiet";
  large?: boolean;
}

/** Fresh Figma presentation over the existing accessible button primitive. */
export const FreshButton = forwardRef<HTMLButtonElement, FreshButtonProps>(function FreshButton({ tone = "secondary", large = false, className = "", children, ...props }, ref): ReactElement {
  return <Button ref={ref} variant="unstyled" className={`vf-button !h-auto ${className}`} data-tone={tone} data-large={large || undefined} {...props}>{props.asChild ? children : <span>{children}</span>}</Button>;
});

export type FreshIconName = "folder" | "plus" | "conversation" | "media" | "video" | "sketch" | "help" | "account" | "down" | "more" | "close" | "undo" | "undo-2" | "redo-2" | "play" | "pause" | "volume" | "fullscreen" | "check";
const ICON_FILES: Record<FreshIconName, string> = {
  folder: "workspace-nav-folder.svg", plus: "workspace-nav-plus.svg", conversation: "project-conversation.svg", media: "fresh-rail-media.svg", video: "fresh-rail-video.svg",
  sketch: "fresh-rail-sketch.svg", help: "workspace-nav-help.svg", account: "workspace-nav-account.svg", down: "workspace-frame6.svg", more: "workspace-frame7.svg",
  close: "workspace-frame16.svg", undo: "workspace-frame17.svg", "undo-2": "fresh-undo-2.svg", "redo-2": "fresh-redo-2.svg", play: "workspace-frame4.svg", pause: "workspace-frame1.svg", volume: "workspace-frame2.svg", fullscreen: "workspace-frame3.svg", check: "workspace-frame19.svg",
};

export function FreshIcon({ name }: { name: FreshIconName }): ReactElement {
  return <span className="vf-icon" aria-hidden="true" style={{ maskImage: `url("/design-assets/${ICON_FILES[name]}")` }} />;
}

export const FreshIconButton = forwardRef<HTMLButtonElement, ButtonProps & { icon: FreshIconName; label: string }>(function FreshIconButton({ icon, label, className = "", ...props }, ref): ReactElement {
  return <Button ref={ref} variant="unstyled" size="icon" aria-label={label} className={`vf-icon-button !h-auto ${className}`} {...props}><FreshIcon name={icon} /></Button>;
});
