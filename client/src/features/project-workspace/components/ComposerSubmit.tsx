import { useEffect, useRef, useState, type ReactElement } from "react";
import { FreshButton, FreshIconButton } from "@/components/fresh/FreshButton";
import { Popover, PopoverAnchor, PopoverContent } from "@promptstudio/system/components/ui/popover";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@promptstudio/system/components/ui/sheet";
import type { CreationAction } from "@shared/schemas/workflow/draft.schemas";

const ACTIONS: Array<{ action: CreationAction | "area"; label: string; icon: string }> = [
  { action: "make-image", label: "Make an image", icon: "picture" },
  { action: "edit-image", label: "Edit an image", icon: "edit" },
  { action: "animate-image", label: "Animate an image", icon: "clip" },
  { action: "make-video", label: "Make a video", icon: "clip" },
  { action: "extend-video", label: "Extend a clip", icon: "extend" },
  { action: "area", label: "Edit a region", icon: "area" },
  { action: "improve-words", label: "Improve wording", icon: "words" },
  { action: "ask", label: "Ask a question", icon: "question" },
];

interface ComposerSubmitProps {
  action: CreationAction;
  label: string;
  writable: boolean;
  hasProfile: boolean;
  canSubmit: boolean;
  busy: boolean;
  onSubmit(): void;
  onActionChange?(action: CreationAction): void;
  onAreaEdit?(): void;
  onImproveWords?(): void;
}

/** C01/C02/C38: the same primary becomes the action chooser before an action is selected. */
export function ComposerSubmit({ action, label, writable, hasProfile, canSubmit, busy, onSubmit, onActionChange, onAreaEdit, onImproveWords }: ComposerSubmitProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => { const query = window.matchMedia?.("(width < 768px)"); if (!query) return; const update = (): void => setMobile(query.matches); update(); query.addEventListener?.("change", update); return () => query.removeEventListener?.("change", update); }, []);
  const [chosen, setChosen] = useState(false);
  const choosing = Boolean(onActionChange) && !hasProfile && !chosen && action === "make-image";
  const actionButton = <FreshButton ref={primary} tone="primary" className="vf-submit" data-choosing={choosing || undefined} disabled={choosing ? !writable : !canSubmit} aria-label={choosing ? "Choose request action" : undefined} aria-haspopup={choosing ? "dialog" : undefined} aria-expanded={choosing ? open : undefined} onClick={() => choosing ? setOpen(true) : onSubmit()} onContextMenu={event => { if (onActionChange && writable) { event.preventDefault(); setOpen(true); } }} onKeyDown={event => { if (onActionChange && writable && event.altKey && event.key === "ArrowDown") { event.preventDefault(); setOpen(true); } }}>{busy ? "Starting…" : choosing ? "Choose action" : label}</FreshButton>;
  const options = <div className="vf-action-options">{ACTIONS.map(item => <FreshButton className="vf-action-option" tone="quiet" key={item.action} aria-pressed={item.action === action && !choosing} disabled={item.action === "area" && !onAreaEdit} onClick={() => { if (item.action === "area") onAreaEdit?.(); else if (item.action === "improve-words" && onImproveWords) onImproveWords(); else { onActionChange?.(item.action); setChosen(true); } setOpen(false); }}><img src={`/design-assets/workspace-action-${item.icon}.svg`} alt="" />{item.label}</FreshButton>)}</div>;
  if (mobile) return <div className="vf-submit-row"><Sheet open={open} onOpenChange={setOpen}>{actionButton}<SheetContent side="bottom" className="vf vf-action-sheet" aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); primary.current?.focus(); }}><SheetTitle className="sr-only">Choose action</SheetTitle><header><SheetClose asChild><FreshIconButton icon="close" label="Close actions" /></SheetClose></header>{options}</SheetContent></Sheet></div>;
  return <div className="vf-submit-row"><Popover modal={false} open={open} onOpenChange={setOpen}><PopoverAnchor asChild>{actionButton}</PopoverAnchor><PopoverContent className="vf vf-setting-menu vf-action-menu" side="bottom" align="end" sideOffset={6} collisionPadding={12} onCloseAutoFocus={event => { event.preventDefault(); primary.current?.focus(); }}>{options}</PopoverContent></Popover></div>;
}
