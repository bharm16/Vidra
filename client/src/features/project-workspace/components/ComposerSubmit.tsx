import { useRef, type ReactElement } from "react";
import { FreshButton } from "@/components/fresh/FreshButton";
import { RESHAPE_VALUE, Swap } from "@/components/motion/Swap";
import type { CreationAction } from "@shared/schemas/workflow/draft.schemas";
import { OutputSwitch, outputGroup } from "./OutputSwitch";

interface ComposerSubmitProps {
  action: CreationAction;
  label: string;
  writable: boolean;
  canSubmit: boolean;
  busy: boolean;
  onSubmit(): void;
  onActionChange?(action: CreationAction): void;
}

/** The switch says what to make and the primary makes it (Rule 3); changes to existing media start from the media itself. */
export function ComposerSubmit({ action, label, writable, canSubmit, busy, onSubmit, onActionChange }: ComposerSubmitProps): ReactElement {
  // Only another output cross-fades the label (frame 2681); asking a question or Starting… change it at once.
  const output = useRef(outputGroup(action));
  output.current = outputGroup(action) ?? output.current;
  return <div className="vf-submit-row">
    {onActionChange ? <OutputSwitch action={action} disabled={!writable} onChange={onActionChange} /> : null}
    <FreshButton tone="primary" className="vf-submit" disabled={!canSubmit} onClick={onSubmit}><Swap swapKey={output.current} motion={RESHAPE_VALUE}>{busy ? "Starting…" : label}</Swap></FreshButton>
  </div>;
}
