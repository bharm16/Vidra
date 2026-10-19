import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@promptstudio/system/components/ui/popover";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@promptstudio/system/components/ui/sheet";

interface SettingsMenuProps {
  title: string;
  trigger: ReactElement;
  children: ReactNode;
  open: boolean;
  onOpenChange(open: boolean): void;
  className?: string;
  align?: "start" | "center" | "end";
  sideOffset?: number;
  alignOffset?: number;
}

/** The same settings use anchored menus on desktop and the canonical B13 sheet on touch. */
export function SettingsMenu({ title, trigger, children, open, onOpenChange, className = "", align = "start", sideOffset = 6, alignOffset = 0 }: SettingsMenuProps): ReactElement {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const pointerOpened = useRef(false);
  useEffect(() => {
    const query = window.matchMedia?.("(width < 768px)");
    if (!query) return;
    const update = (): void => setMobile(query.matches);
    update(); query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  if (mobile) return <Sheet open={open} onOpenChange={onOpenChange}><SheetTrigger asChild>{trigger}</SheetTrigger><SheetContent side="bottom" className={`vf vf-settings-sheet ${className}`} aria-describedby={undefined}><div className="vf-settings-handle" aria-hidden="true" /><SheetTitle>{title}</SheetTitle><div className="vf-settings-sheet-options">{children}</div></SheetContent></Sheet>;
  return <Popover open={open} onOpenChange={onOpenChange} modal={false}><PopoverTrigger asChild onPointerDown={() => { pointerOpened.current = true; }} onKeyDown={() => { pointerOpened.current = false; }}>{trigger}</PopoverTrigger><PopoverContent className={`vf vf-setting-menu ${className}`} onOpenAutoFocus={event => {
    // A pointer-opened menu takes focus on its surface, not its first field (C39/G27); keyboard opening still lands in the first field.
    if (!pointerOpened.current || !(event.currentTarget instanceof HTMLElement)) return;
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
  }} side="bottom" align={align} alignOffset={alignOffset} sideOffset={sideOffset} collisionPadding={12}>{children}</PopoverContent></Popover>;
}
