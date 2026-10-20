import type { KeyboardEvent, ReactElement } from "react";
import { FreshButton } from "@/components/fresh/FreshButton";
import type { CreationAction } from "@shared/schemas/workflow/draft.schemas";

export type OutputGroup = "video" | "image";

const OUTPUTS: ReadonlyArray<{
  group: OutputGroup;
  label: string;
  action: CreationAction;
}> = [
  { group: "video", label: "Video", action: "make-video" },
  { group: "image", label: "Image", action: "make-image" },
];

const GROUP_OF: Partial<Record<CreationAction, OutputGroup>> = {
  "make-video": "video",
  "animate-image": "video",
  "edit-video": "video",
  "extend-video": "video",
  "make-image": "image",
  "edit-image": "image",
};

/** What a request makes. Its inputs, not another control, decide whether a video animates, edits or extends. */
export function outputGroup(action: CreationAction): OutputGroup | undefined {
  return GROUP_OF[action];
}

/** Rule 3: the composer's only output switch, beside the primary. */
export function OutputSwitch({
  action,
  disabled,
  onChange,
}: {
  action: CreationAction;
  disabled: boolean;
  onChange(action: CreationAction): void;
}): ReactElement {
  const current = outputGroup(action);
  const focusable = current ?? OUTPUTS[0]?.group;
  const choose = (index: number): void => {
    const next = OUTPUTS[index];
    if (next && next.group !== current) onChange(next.action);
  };
  const move = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + OUTPUTS.length) % OUTPUTS.length;
    choose(next);
    const sibling = event.currentTarget.parentElement?.children[next];
    if (sibling instanceof HTMLElement) sibling.focus();
  };
  return (
    <div className="vf-output-switch" role="radiogroup" aria-label="Output">
      {OUTPUTS.map((item, index) => (
        <FreshButton
          key={item.group}
          tone="quiet"
          className="vf-output-option"
          role="radio"
          aria-checked={item.group === current}
          tabIndex={item.group === focusable ? 0 : -1}
          disabled={disabled}
          onClick={() => choose(index)}
          onKeyDown={(event) => move(event, index)}
        >
          {item.label}
        </FreshButton>
      ))}
    </div>
  );
}
