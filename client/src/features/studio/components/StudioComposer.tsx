import React, { useRef, useState } from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@promptstudio/system/components/ui/dropdown-menu";
import { X } from "lucide-react";
import expandIcon from "../assets/composer-expand.svg";
import sendIcon from "../assets/composer-send.svg";
import modelChevronIcon from "../assets/model-chevron.svg";
import attachIcon from "../assets/composer-attach.svg";
import { cn } from "@/utils/cn";
import type { StudioAttachment, StudioModelInfo } from "../api/schemas";

/**
 * Band 3: the composer. Row A = the text field with the expand toggle at
 * its top-right. Row B = model picker on the left, flex gap, send anchored
 * right. Desktop attachment lives in the canvas toolbar; the mobile composer
 * retains its attachment action. Model choices show latency hints only.
 */

interface StudioComposerProps {
  models: StudioModelInfo[];
  /** Plain string: a stale pin (slug no longer in the roster) reads as Auto. */
  pinnedModel: string | null;
  busy: boolean;
  /** S-12: uploaded-but-unsent reference images staged on the composer. */
  pendingAttachments: StudioAttachment[];
  /** A roster slug, or null for Auto — the server owns the roster. */
  onPin: (slug: string | null) => void;
  onSend: (message: string) => void;
  onAttachFile: (file: File) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  attachmentPickerRef?: React.RefObject<HTMLInputElement> | undefined;
}

export function StudioComposer({
  models,
  pinnedModel,
  busy,
  pendingAttachments,
  onPin,
  onSend,
  onAttachFile,
  onRemoveAttachment,
  attachmentPickerRef,
}: StudioComposerProps): React.ReactElement {
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  const ownFileInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = attachmentPickerRef ?? ownFileInputRef;

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
    <div
      className={cn("st-composer", expanded && "st-composer-expanded")}
      data-testid="studio-composer"
    >
      {pinIsStale ? (
        <p className="st-stale-pin-note" role="status">
          Your pinned model is no longer available — using Auto.
        </p>
      ) : null}
      {pendingAttachments.length > 0 ? (
        <div className="st-attach-chips">
          {pendingAttachments.map((attachment) => (
            <span key={attachment.id} className="st-attach-chip">
              <img src={attachIcon} alt="" />
              <span className="st-attach-name">{attachment.filename}</span>
              <Button
                variant="ghost"
                type="button"
                className="st-attach-remove"
                aria-label={`Remove ${attachment.filename}`}
                onClick={() => onRemoveAttachment(attachment.id)}
              >
                <X size={11} strokeWidth={1.75} />
              </Button>
            </span>
          ))}
        </div>
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
          <img src={expandIcon} alt="" />
        </Button>
      </div>

      <div className="st-writing-divider" aria-hidden="true" />
      <div className="st-composer-strip">
        <div className="st-picker">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" type="button" className="st-picker-btn">
                <span className="st-picker-label">
                  {pinnedInfo ? pinnedInfo.displayName : "Auto"}
                </span>
                <span className="st-model-chevron">
                  <img src={modelChevronIcon} alt="" />
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="st-picker-pop"
              side="top"
              align="start"
              sideOffset={8}
              aria-label="Image model"
            >
              <DropdownMenuItem
                role="menuitemradio"
                aria-checked={pinnedInfo === null}
                className={cn(
                  "st-picker-row",
                  pinnedInfo === null && "st-picker-row-active",
                )}
                onSelect={() => onPin(null)}
              >
                <span className="st-picker-name">Auto</span>
                <span className="st-picker-hint">
                  We pick the model for your task
                </span>
              </DropdownMenuItem>
              {models.map((model) => (
                <DropdownMenuItem
                  key={model.slug}
                  role="menuitemradio"
                  aria-checked={pinnedModel === model.slug}
                  className={cn(
                    "st-picker-row",
                    pinnedModel === model.slug && "st-picker-row-active",
                  )}
                  onSelect={() => onPin(model.slug)}
                >
                  <span className="st-picker-name">{model.displayName}</span>
                  <span className="st-picker-hint">
                    ~{model.latencyHintSeconds}s
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="st-strip-gap" />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          aria-label="Attach image file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onAttachFile(file);
            event.target.value = "";
          }}
        />
        <Button
          variant="ghost"
          type="button"
          className="st-icon-btn st-attach-btn"
          title="Attach image"
          aria-label="Attach image"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          <img src={attachIcon} alt="" />
        </Button>

        <Button
          variant="ghost"
          type="button"
          className="st-send"
          title="Send"
          aria-label="Send"
          disabled={busy || draft.trim().length === 0}
          onClick={submit}
        >
          <img src={sendIcon} alt="" />
        </Button>
      </div>
    </div>
  );
}
