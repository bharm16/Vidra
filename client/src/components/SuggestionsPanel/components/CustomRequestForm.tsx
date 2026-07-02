/**
 * CustomRequestForm Component
 *
 * Form for submitting custom suggestion requests.
 */

import type { FormEvent, ReactElement } from "react";
import { Loader2, Sparkles } from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import { Textarea } from "@promptstudio/system/components/ui/textarea";
import { MAX_REQUEST_LENGTH } from "../config/panelConfig";

interface CustomRequestFormProps {
  customRequest?: string;
  onCustomRequestChange?: (value: string) => void;
  onSubmit?: () => void;
  isLoading?: boolean;
  placeholder?: string;
  helperText?: string;
  ctaLabel?: string;
  variant?: "default" | "tokenEditor";
}

export function CustomRequestForm({
  customRequest = "",
  onCustomRequestChange = () => {},
  onSubmit = () => {},
  isLoading = false,
  placeholder,
  helperText = "Describe the tone, detail, or direction you want to see.",
  ctaLabel = "Get Suggestions",
  variant = "default",
}: CustomRequestFormProps): ReactElement {
  const defaultPlaceholder = "Make it more cinematic, brighter, tense, etc.";

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    onSubmit();
  };

  if (variant === "tokenEditor") {
    const tokenEditorPlaceholder =
      placeholder ?? "e.g. more cinematic, more intense, younger, older";
    const tokenEditorCtaLabel = ctaLabel || "Generate more";

    return (
      <div className="-mt-0.5 flex w-full flex-col gap-2">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          <Textarea
            id="custom-request"
            value={customRequest}
            onChange={(e) => onCustomRequestChange(e.target.value)}
            placeholder={tokenEditorPlaceholder}
            className="border-border bg-surface-1 text-label-12 text-foreground placeholder:text-faint focus-visible:border-border-strong min-h-12 w-full resize-y rounded-md border px-3 py-2"
            maxLength={MAX_REQUEST_LENGTH}
          />

          <Button
            type="submit"
            disabled={isLoading || !customRequest.trim()}
            variant="ghost"
            className="text-label-12 text-foreground h-8 w-full gap-1 rounded-md border border-white/10 bg-white/10 px-3 transition-colors duration-150 hover:border-white/20 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
            aria-busy={isLoading}
            aria-live="polite"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                <span>{tokenEditorCtaLabel}</span>
              </>
            )}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="border-border bg-app flex-shrink-0 space-y-2 border-b px-3 py-2">
      <div className="space-y-1">
        <label
          htmlFor="custom-request"
          className="text-label-12 text-muted uppercase tracking-wider"
        >
          Need something specific?
        </label>
        <p className="text-label-12 text-muted">{helperText}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <Textarea
          id="custom-request"
          value={customRequest}
          onChange={(e) => onCustomRequestChange(e.target.value)}
          placeholder={placeholder ?? defaultPlaceholder}
          className="text-label-12 text-foreground bg-app border-border focus:border-border-strong h-10 w-full rounded-md border px-2 py-1"
          maxLength={MAX_REQUEST_LENGTH}
        />

        <Button
          type="submit"
          disabled={isLoading || !customRequest.trim()}
          variant="ghost"
          className={`text-label-12 w-full gap-1 rounded-md px-3 py-1 transition-colors duration-150 ${
            isLoading || !customRequest.trim()
              ? "bg-surface-2 text-muted cursor-not-allowed"
              : "bg-foreground hover:bg-muted text-white"
          }`}
          aria-busy={isLoading}
          aria-live="polite"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              <span>{ctaLabel}</span>
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
