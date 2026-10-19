import type { ReactElement } from "react";
import { FreshButton } from "@/components/fresh/FreshButton";
import "./workspace-notice-fidelity.css";

export interface WorkspaceNoticeProps {
  title: string;
  message: string;
  actionLabel: string;
  onAction(): void;
  disabled?: boolean;
}

/** Source notice for offline, archived conversation and temporary admission refusal. */
export function WorkspaceNotice({ title, message, actionLabel, onAction, disabled = false }: WorkspaceNoticeProps): ReactElement {
  return <div className="vf-workspace-notice" role="status"><img src="/design-assets/prompt-history/warning.svg" alt="" /><div><p className="vf-workspace-notice-title">{title}</p><p className="vf-workspace-notice-message">{message}</p></div><FreshButton disabled={disabled} onClick={onAction}>{actionLabel}</FreshButton></div>;
}

/** Retained result action in the viewer's header, without changing the viewed media. */
export function BackgroundResultNotice({ message, onView }: { message?: string; onView(): void }): ReactElement {
  return <div className="vf-background-result-notice" role="status">{message ? <p>{message}</p> : null}<FreshButton tone="quiet" onClick={onView}>View result</FreshButton></div>;
}
