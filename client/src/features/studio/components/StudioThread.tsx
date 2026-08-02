import React, { useEffect, useRef, useState } from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import { ChevronUp } from "lucide-react";
import { cn } from "@/utils/cn";
import type { StudioTurn } from "../api/schemas";
import { ResultCard } from "./ResultCard";

/**
 * Band 2 of the chat panel: everything renders inline as cards — clarify
 * questions, results, negotiation, and the suggestion pill row directly
 * beneath the batch it belongs to (plan: "Left chat panel — three bands").
 */

/**
 * The LLM's per-turn reasoning above its results (behavior 8, mirroring
 * the reference product): expanded by default, collapsible per turn.
 */
function ThinkingSection({ text }: { text: string }): React.ReactElement {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="st-reasoning" data-testid="studio-thinking">
      <Button
        variant="ghost"
        type="button"
        className="st-reasoning-toggle"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((value) => !value)}
      >
        Thinking
        <ChevronUp
          size={13}
          strokeWidth={1.75}
          className={cn(
            "st-reasoning-chevron",
            collapsed && "st-reasoning-chevron-collapsed",
          )}
        />
      </Button>
      {collapsed ? null : <p className="st-reasoning-text">{text}</p>}
    </div>
  );
}

interface StudioThreadProps {
  turns: StudioTurn[];
  optimisticMessage: string | null;
  /** Assistant thinking streaming in for the in-flight turn (realtime). */
  streamingThinking: string | null;
  pendingTurnId: string | null;
  /**
   * A turn is in flight (isTurnInFlight). Passed in rather than re-derived:
   * deriving it from pendingTurnId alone left every pill live through the
   * streaming window, and a click there started a second concurrent turn.
   */
  busy: boolean;
  selectedImageId: string | null;
  error: string | null;
  onSelectImage: (imageId: string) => void;
  /** Quick-picks and suggestion pills are messages (behavior 4). */
  onSendMessage: (message: string) => void;
  onDismissError: () => void;
}

export function StudioThread({
  turns,
  optimisticMessage,
  streamingThinking,
  pendingTurnId,
  busy,
  selectedImageId,
  error,
  onSelectImage,
  onSendMessage,
  onDismissError,
}: StudioThreadProps): React.ReactElement {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, optimisticMessage, streamingThinking, error]);

  const latestTurnId = turns.at(-1)?.id ?? null;

  return (
    <div className="st-thread" data-testid="studio-thread">
      {turns.length === 0 && optimisticMessage === null ? (
        <div className="st-thread-empty">
          Describe the image you want — variations, follow-up suggestions, and
          edits happen here.
        </div>
      ) : null}

      {turns.map((turn) => {
        const isLatest = turn.id === latestTurnId;
        const decision = turn.decision;
        return (
          <div key={turn.id} className="st-turn">
            <div className="st-msg-user">{turn.userMessage}</div>

            {decision.action === "clarify" ? (
              <div className="st-card">
                {decision.questions.map((question) => (
                  <div key={question.text} className="st-question">
                    <div className="st-card-text">{question.text}</div>
                    <div className="st-pills">
                      {question.quickPicks.map((pick) => (
                        <Button
                          variant="ghost"
                          key={pick}
                          type="button"
                          className="st-pill"
                          disabled={busy}
                          onClick={() => onSendMessage(pick)}
                        >
                          {pick}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {decision.action === "diagnose" ? (
              <div className="st-card">
                <div className="st-card-text">{decision.question}</div>
                <div className="st-pills">
                  {decision.quickPicks.map((pick) => (
                    <Button
                      variant="ghost"
                      key={pick}
                      type="button"
                      className="st-pill"
                      disabled={busy}
                      onClick={() => onSendMessage(pick)}
                    >
                      {pick}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {decision.action === "negotiate" ? (
              <div className="st-card">
                <div className="st-card-text">{decision.reason}</div>
                <div className="st-pills">
                  {decision.options.map((option) => (
                    <Button
                      variant="ghost"
                      key={option.label}
                      type="button"
                      className="st-pill"
                      disabled={busy}
                      onClick={() => onSendMessage(option.message)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {decision.action === "generate" ||
            decision.action === "edit" ||
            decision.action === "transform" ? (
              <>
                {decision.thinking ? (
                  <ThinkingSection text={decision.thinking} />
                ) : null}
                {turn.status === "failed" ? (
                  <div className="st-card st-card-error">
                    <div className="st-card-text">
                      {turn.calls.find((call) => call.error)?.error ??
                        "Generation failed."}
                    </div>
                  </div>
                ) : (
                  <ResultCard
                    turn={turn}
                    selectedImageId={selectedImageId}
                    onSelect={onSelectImage}
                  />
                )}
                {turn.status !== "running" && turn.status !== "failed" ? (
                  <div className="st-pills st-pills-suggestions">
                    {decision.suggestions.map((suggestion) => (
                      <Button
                        variant="ghost"
                        key={suggestion}
                        type="button"
                        className="st-pill"
                        disabled={busy || !isLatest}
                        onClick={() => onSendMessage(suggestion)}
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        );
      })}

      {optimisticMessage !== null ? (
        <div className="st-turn">
          <div className="st-msg-user">{optimisticMessage}</div>
          {streamingThinking ? (
            // Realtime: the assistant's reasoning, character by character.
            <ThinkingSection text={streamingThinking} />
          ) : (
            <div className="st-thinking">Thinking…</div>
          )}
        </div>
      ) : null}

      {pendingTurnId !== null && optimisticMessage === null ? (
        <div className="st-thinking">Generating…</div>
      ) : null}

      {error !== null ? (
        <div
          className="st-card st-card-error"
          data-testid="studio-error"
          role="alert"
        >
          <div className="st-card-text">{error}</div>
          <Button
            variant="ghost"
            type="button"
            className="st-pill"
            onClick={onDismissError}
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      <div ref={endRef} />
    </div>
  );
}
