import { useEffect, useRef, type ReactElement, type ReactNode } from "react";
import { Button } from "@promptstudio/system/button";
import { FreshIconButton } from "@/components/fresh/FreshButton";

export interface FocusViewProps {
  children: ReactNode;
  /** The history rail stays as Focus's filmstrip (P3). */
  rail: ReactNode;
  onClose(): void;
  onPrevious?: (() => void) | undefined;
  onNext?: (() => void) | undefined;
  /** The result on screen; closing returns focus to its feed tile. */
  viewedId?: string | undefined;
}

function Arrow({ side, onClick }: { side: "previous" | "next"; onClick: (() => void) | undefined }): ReactElement {
  return <Button type="button" variant="ghost" className="vf-focus-arrow" data-side={side} aria-label={side === "previous" ? "Previous result" : "Next result"} disabled={!onClick} onClick={onClick}><span className="vf-icon" aria-hidden="true" style={{ maskImage: `url("/design-assets/fresh-icon-chevron-${side === "previous" ? "left" : "right"}.svg")` }} /></Button>;
}

/** The large player on demand, over the workspace; closing returns to the same feed scroll. */
export function FocusView({ children, rail, onClose, onPrevious, onNext, viewedId }: FocusViewProps): ReactElement {
  const surface = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const viewed = useRef(viewedId); viewed.current = viewedId;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    surface.current?.focus({ preventScroll: true });
    // Closing returns to the tile of the result last shown, which is the one a batch's buttons now act on.
    return () => {
      const id = viewed.current;
      const tile = id ? document.querySelector<HTMLElement>(`[data-version-id="${CSS.escape(id)}"]`) : null;
      const target = tile ?? previous;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, []);
  return <div ref={surface} className="vf vf-focus" role="dialog" aria-modal="true" aria-label="Focus" tabIndex={-1} onKeyDown={event => {
    if (event.defaultPrevented) return;
    const target = event.target;
    const typing = target instanceof HTMLElement && Boolean(target.closest("input,textarea,select,[contenteditable=true]"));
    if (event.key === "Escape" && !document.querySelector("[data-radix-popper-content-wrapper]")) { event.preventDefault(); close.current(); }
    else if (!typing && event.key === "ArrowLeft" && onPrevious) { event.preventDefault(); onPrevious(); }
    else if (!typing && event.key === "ArrowRight" && onNext) { event.preventDefault(); onNext(); }
  }}>
    {rail}
    <Arrow side="previous" onClick={onPrevious} />
    <div className="vf-focus-stage">{children}</div>
    <Arrow side="next" onClick={onNext} />
    <FreshIconButton className="vf-focus-close" icon="close" label="Close focus" onClick={onClose} />
  </div>;
}
