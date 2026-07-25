import React, { useEffect, useRef, useState } from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import { ArrowUp, ChevronDown, Maximize2 } from "lucide-react";
import { cn } from "@/utils/cn";
import type { StudioModelInfo, StudioModelSlug } from "../api/schemas";

/**
 * Band 3: the composer. Row A = the text field with the expand toggle at
 * its top-right. Row B = model picker on the left, flex gap, send anchored
 * right (plan: "Layout and control placement"). No settings button, no
 * attach, no cost hints — latency hints only (S-37 / behavior 9).
 */

interface StudioComposerProps {
  models: StudioModelInfo[];
  /** Plain string: a stale pin (slug no longer in the roster) reads as Auto. */
  pinnedModel: string | null;
  busy: boolean;
  onPin: (slug: StudioModelSlug | null) => void;
  onSend: (message: string) => void;
}

export function StudioComposer({
  models,
  pinnedModel,
  busy,
  onPin,
  onSend,
}: StudioComposerProps): React.ReactElement {
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (
        pickerRef.current &&
        event.target instanceof Node &&
        !pickerRef.current.contains(event.target)
      ) {
        setPickerOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pickerOpen]);

  const submit = (): void => {
    const message = draft.trim();
    if (!message || busy) return;
    setDraft("");
    onSend(message);
  };

  const pinnedInfo = models.find((model) => model.slug === pinnedModel) ?? null;
  // Behavior 9: a saved pin that no longer resolves reads as Auto with a
  // one-line notice. Roster must be loaded before judging staleness.
  const pinIsStale =
    pinnedModel !== null && models.length > 0 && pinnedInfo === null;

  return (
    <div className="st-composer" data-testid="studio-composer">
      {pinIsStale ? (
        <p className="st-stale-pin-note" role="status">
          Your pinned model is no longer available — using Auto.
        </p>
      ) : null}
      <div className="st-composer-field">
        <textarea
          className={cn("st-input", expanded && "st-input-expanded")}
          placeholder="Ask anything"
          aria-label="Message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <Button
          variant="ghost"
          type="button"
          className="st-icon-btn st-expand"
          title={expanded ? "Shrink field" : "Expand field"}
          aria-label={expanded ? "Shrink field" : "Expand field"}
          onClick={() => setExpanded((value) => !value)}
        >
          <Maximize2 size={13} strokeWidth={1.8} />
        </Button>
      </div>

      <div className="st-composer-strip">
        <div ref={pickerRef} className="st-picker">
          <Button
            variant="ghost"
            type="button"
            className="st-picker-btn"
            aria-haspopup="listbox"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((value) => !value)}
          >
            {pinnedInfo ? pinnedInfo.displayName : "Auto"}
            <ChevronDown size={13} strokeWidth={1.8} />
          </Button>
          {pickerOpen ? (
            <div className="st-picker-pop" role="listbox" aria-label="Model">
              <Button
                variant="ghost"
                type="button"
                role="option"
                aria-selected={pinnedModel === null}
                className={cn(
                  "st-picker-row",
                  pinnedModel === null && "st-picker-row-active",
                )}
                onClick={() => {
                  onPin(null);
                  setPickerOpen(false);
                }}
              >
                <span className="st-picker-name">Auto</span>
                <span className="st-picker-hint">
                  We pick the model for your task
                </span>
              </Button>
              {models.map((model) => (
                <Button
                  variant="ghost"
                  key={model.slug}
                  type="button"
                  role="option"
                  aria-selected={pinnedModel === model.slug}
                  className={cn(
                    "st-picker-row",
                    pinnedModel === model.slug && "st-picker-row-active",
                  )}
                  onClick={() => {
                    onPin(model.slug);
                    setPickerOpen(false);
                  }}
                >
                  <span className="st-picker-name">{model.displayName}</span>
                  <span className="st-picker-hint">
                    ~{model.latencyHintSeconds}s
                  </span>
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="st-strip-gap" />

        <Button
          variant="ghost"
          type="button"
          className="st-send"
          title="Send"
          aria-label="Send"
          disabled={busy || draft.trim().length === 0}
          onClick={submit}
        >
          <ArrowUp size={16} strokeWidth={2.2} />
        </Button>
      </div>
    </div>
  );
}
