import type { ReactElement, ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@promptstudio/system/select";

export interface EditorSelectOption { value: string; label: string; }

/** The same recessed segment and anchored option menu used in the Figma controls. */
export function EditorSelect({ label, value, options, disabled = false, className = "", contentClassName = "", leading, onChange }: { label: string; value: string; options: EditorSelectOption[]; disabled?: boolean; className?: string; contentClassName?: string; leading?: ReactNode; onChange(value: string): void }): ReactElement {
  return <Select value={value} onValueChange={onChange} disabled={disabled}>
    <SelectTrigger aria-label={label} className={`ve-select-segment ${className}`} variant="ghost" size="sm">{leading}<SelectValue /></SelectTrigger>
    <SelectContent className={`vf ve-select-menu ${contentClassName}`} sideOffset={6} align="start" position="popper">{options.map(option => <SelectItem className="ve-select-option" key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
  </Select>;
}
