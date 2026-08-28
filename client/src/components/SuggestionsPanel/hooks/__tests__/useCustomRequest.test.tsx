/**
 * Unit tests for useCustomRequest hook
 */

import {
  describe,
  expect,
  it,
  beforeEach,
  vi,
  type MockedFunction,
} from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { useCustomRequest } from "@components/SuggestionsPanel/hooks/useCustomRequest";
import { fetchCustomSuggestions } from "@features/prompt-optimizer/api/customSuggestionsApi";
import { CancellationError } from "@features/prompt-optimizer/utils/signalUtils";
import type { SuggestionItem } from "@components/SuggestionsPanel/hooks/types";
import { logger } from "@/services/LoggingService";

vi.mock("@features/prompt-optimizer/api/customSuggestionsApi", () => ({
  fetchCustomSuggestions: vi.fn(),
  customSuggestionsApi: {
    fetchCustomSuggestions: vi.fn(),
  },
}));

vi.mock("@/services/LoggingService", () => ({
  logger: {
    startTimer: vi.fn(),
    endTimer: vi.fn().mockReturnValue(123),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

const mockFetchCustomSuggestions = vi.mocked(fetchCustomSuggestions);
const mockLogger = vi.mocked(logger);

describe("useCustomRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when customRequest is empty", async () => {
    const setSuggestions = vi.fn();
    const setError = vi.fn();

    const { result } = renderHook(() =>
      useCustomRequest({ setSuggestions, setError }),
    );

    await act(async () => {
      await result.current.handleCustomRequest();
    });

    expect(setSuggestions).not.toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
    expect(result.current.isCustomLoading).toBe(false);
  });

  it("uses onCustomRequest when provided and updates suggestions", async () => {
    const setSuggestions = vi.fn();
    const setError = vi.fn();
    const suggestions: SuggestionItem[] = [{ text: "Sharper focus" }];
    const onCustomRequest: MockedFunction<
      (request: string) => Promise<SuggestionItem[]>
    > = vi.fn();
    onCustomRequest.mockResolvedValue(suggestions);

    const { result } = renderHook(() =>
      useCustomRequest({
        selectedText: "scene",
        fullPrompt: "full prompt",
        onCustomRequest,
        setSuggestions,
        setError,
      }),
    );

    await act(async () => {
      result.current.setCustomRequest("  Sharpen the focus ");
    });

    await act(async () => {
      await result.current.handleCustomRequest();
    });

    expect(onCustomRequest).toHaveBeenCalledWith("Sharpen the focus");
    expect(mockFetchCustomSuggestions).not.toHaveBeenCalled();
    expect(setSuggestions).toHaveBeenCalledWith(suggestions, undefined);
    expect(setError).toHaveBeenCalledWith("");
    await waitFor(() => {
      expect(result.current.customRequest).toBe("");
    });
  });

  it("falls back to fetchCustomSuggestions when onCustomRequest is not provided", async () => {
    const setSuggestions = vi.fn();
    const setError = vi.fn();
    mockFetchCustomSuggestions.mockResolvedValue([
      { text: "One" },
      { text: "Two" },
    ]);

    const { result } = renderHook(() =>
      useCustomRequest({
        selectedText: "scene",
        fullPrompt: "full prompt",
        setSuggestions,
        setError,
      }),
    );

    await act(async () => {
      result.current.setCustomRequest("Add light");
    });

    await act(async () => {
      await result.current.handleCustomRequest();
    });

    expect(mockFetchCustomSuggestions).toHaveBeenCalledWith({
      highlightedText: "scene",
      customRequest: "Add light",
      fullPrompt: "full prompt",
      signal: expect.any(AbortSignal),
    });
    expect(setSuggestions).toHaveBeenCalledWith(
      [{ text: "One" }, { text: "Two" }],
      undefined,
    );
    expect(setError).toHaveBeenCalledWith("");
  });

  it("ignores CancellationError without setting error state", async () => {
    const setError = vi.fn();
    const onCustomRequest: MockedFunction<
      (request: string) => Promise<SuggestionItem[]>
    > = vi.fn();
    onCustomRequest.mockRejectedValue(
      new CancellationError("Request cancelled"),
    );

    const { result } = renderHook(() =>
      useCustomRequest({
        selectedText: "scene",
        fullPrompt: "full prompt",
        onCustomRequest,
        setError,
      }),
    );

    await act(async () => {
      result.current.setCustomRequest("Cancel me");
    });

    await act(async () => {
      await result.current.handleCustomRequest();
    });

    expect(setError).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith("");
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("sets error state when request fails", async () => {
    const setError = vi.fn();
    const onCustomRequest: MockedFunction<
      (request: string) => Promise<SuggestionItem[]>
    > = vi.fn();
    onCustomRequest.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() =>
      useCustomRequest({
        selectedText: "scene",
        fullPrompt: "full prompt",
        onCustomRequest,
        setError,
      }),
    );

    await act(async () => {
      result.current.setCustomRequest("Bad request");
    });

    await act(async () => {
      await result.current.handleCustomRequest();
    });

    expect(setError).toHaveBeenCalledTimes(2);
    expect(setError.mock.calls[0]?.[0]).toBe("");
    expect(setError.mock.calls[1]?.[0]).toBe(
      "Failed to load custom suggestions. Please try again.",
    );
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it("returns early with a user-facing error when selected text or full prompt is missing", async () => {
    const setSuggestions = vi.fn();
    const setError = vi.fn();
    const onCustomRequest: MockedFunction<
      (request: string) => Promise<SuggestionItem[]>
    > = vi.fn();

    const { result } = renderHook(() =>
      useCustomRequest({
        selectedText: "",
        fullPrompt: "",
        onCustomRequest,
        setSuggestions,
        setError,
      }),
    );

    await act(async () => {
      result.current.setCustomRequest("Try this");
    });

    await act(async () => {
      await result.current.handleCustomRequest();
    });

    expect(setError).toHaveBeenCalledWith(
      "Select text in the prompt before applying a custom request.",
    );
    expect(setSuggestions).not.toHaveBeenCalled();
    expect(onCustomRequest).not.toHaveBeenCalled();
    expect(result.current.isCustomLoading).toBe(false);
  });

  it("toggles loading state while a request is in flight", async () => {
    const setSuggestions = vi.fn();
    const setError = vi.fn();
    let resolveRequest: ((value: SuggestionItem[]) => void) | null = null;
    const onCustomRequest: MockedFunction<
      (request: string) => Promise<SuggestionItem[]>
    > = vi.fn(
      (_request: string) =>
        new Promise<SuggestionItem[]>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useCustomRequest({
        selectedText: "scene",
        fullPrompt: "full prompt",
        onCustomRequest,
        setSuggestions,
        setError,
      }),
    );

    await act(async () => {
      result.current.setCustomRequest("Increase contrast");
    });

    let pendingRequest: Promise<void> | null = null;
    await act(async () => {
      pendingRequest = result.current.handleCustomRequest();
    });

    await waitFor(() => {
      expect(result.current.isCustomLoading).toBe(true);
    });

    await act(async () => {
      resolveRequest?.([{ text: "Increase local contrast around subject" }]);
      await pendingRequest;
    });

    expect(result.current.isCustomLoading).toBe(false);
    expect(setSuggestions).toHaveBeenCalledWith(
      [{ text: "Increase local contrast around subject" }],
      undefined,
    );
  });
});
