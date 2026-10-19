import type { ReactElement } from "react";
import { FreshButton } from "@/components/fresh/FreshButton";
import "./prompt-feedback-fidelity.css";

/** Highlighting can retry independently while the working words stay editable. */
export function HighlightingUnavailable({ onRetry }: { onRetry(): void }): ReactElement {
  return <div className="vf-highlighting-unavailable" role="status"><p>Highlighting unavailable.</p><FreshButton tone="quiet" onClick={onRetry}>Retry</FreshButton></div>;
}
