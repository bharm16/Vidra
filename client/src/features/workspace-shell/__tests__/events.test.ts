import { describe, expect, it, vi } from "vitest";
import {
  PROMPT_FOCUS_INTENT,
  addPromptFocusIntentListener,
  dispatchPromptFocusIntent,
} from "../events";

describe("CanvasWorkspace events", () => {
  it("dispatches and listens for prompt focus intent events", () => {
    const listener = vi.fn();
    const remove = addPromptFocusIntentListener(listener);

    dispatchPromptFocusIntent({ source: "tool-rail" });

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]?.[0] as CustomEvent<{
      source?: string;
    }>;
    expect(event.type).toBe(PROMPT_FOCUS_INTENT);
    expect(event.detail.source).toBe("tool-rail");

    remove();
    dispatchPromptFocusIntent({ source: "tool-rail" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
