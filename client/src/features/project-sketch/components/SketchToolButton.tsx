import { Button } from "@promptstudio/system/components/ui/button";
import type { ReactElement } from "react";
import select from "../assets/select.svg";
import brush from "../assets/brush.svg";
import eraser from "../assets/eraser.svg";
import rectangle from "../assets/rectangle.svg";
import ellipse from "../assets/ellipse.svg";
import picture from "../assets/picture.svg";
import undo from "../assets/undo.svg";
import redo from "../assets/redo.svg";
const icons = { select, brush, eraser, rectangle, ellipse, picture, undo, redo };
export function SketchToolButton({ name, label, selected, disabled, onClick }: { name: keyof typeof icons; label: string; selected?: boolean; disabled?: boolean; onClick(): void }): ReactElement {
  return <Button type="button" variant="ghost" size="icon" className="ps-tool !h-auto" data-tool={name} aria-label={label} title={label} aria-pressed={selected} disabled={disabled} onClick={onClick}><span className="ps-tool-glyph" aria-hidden="true" style={{ maskImage: `url("${icons[name]}")` }} /></Button>;
}
