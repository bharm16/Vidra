import { useLayoutEffect, useRef, type KeyboardEvent, type ReactElement } from "react";
import { FreshButton } from "@/components/fresh/FreshButton";
import { stretchButton } from "@/components/motion/surface";
import type { CreationAction } from "@shared/schemas/workflow/draft.schemas";
import { COMPOSER_OUTPUTS, composerOutput } from "@shared/workflow/actionRegistry";

/** Rule 3: the composer's only output switch, beside the primary. Its inputs, not another control, decide whether a video animates, edits or extends. */
export function OutputSwitch({
  action,
  disabled,
  onChange,
}: {
  action: CreationAction;
  disabled: boolean;
  onChange(action: CreationAction): void;
}): ReactElement {
  const current = composerOutput(action);
  const focusable = current ?? COMPOSER_OUTPUTS[0]?.output;
  const options = useRef<HTMLDivElement>(null);
  const shown = useRef(current);
  useLayoutEffect(() => {
    const previous = shown.current;
    shown.current = current;
    if (!previous || !current || previous === current) return;
    const buttons = options.current?.children;
    const from = buttons?.[COMPOSER_OUTPUTS.findIndex(item => item.output === previous)];
    const to = buttons?.[COMPOSER_OUTPUTS.findIndex(item => item.output === current)];
    // The selection stretches out of the old option into the new one (frame 2681).
    if (from instanceof HTMLElement && to instanceof HTMLElement) stretchButton(to, from.getBoundingClientRect());
  }, [current]);
  const choose = (index: number): void => {
    const next = COMPOSER_OUTPUTS[index];
    if (next && next.output !== current) onChange(next.action);
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
    const next = (index + step + COMPOSER_OUTPUTS.length) % COMPOSER_OUTPUTS.length;
    choose(next);
    const sibling = event.currentTarget.parentElement?.children[next];
    if (sibling instanceof HTMLElement) sibling.focus();
  };
  return (
    <div ref={options} className="vf-output-switch" role="radiogroup" aria-label="Output">
      {COMPOSER_OUTPUTS.map((item, index) => (
        <FreshButton
          key={item.output}
          tone="quiet"
          className="vf-output-option"
          role="radio"
          aria-checked={item.output === current}
          tabIndex={item.output === focusable ? 0 : -1}
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
