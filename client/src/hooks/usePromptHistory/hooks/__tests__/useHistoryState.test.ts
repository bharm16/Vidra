import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useHistoryState } from "../useHistoryState";
import type { PromptHistoryEntry } from "@hooks/usePromptHistory/types";

const createEntry = (
  id: string,
  uuid: string,
  input: string,
  output: string,
): PromptHistoryEntry => ({
  id,
  uuid,
  input,
  output,
  timestamp: new Date().toISOString(),
});

describe("useHistoryState", () => {
  it("dedupes by uuid/id in setHistory and caps list to 100", () => {
    const { result } = renderHook(() => useHistoryState());

    const entries: PromptHistoryEntry[] = [];
    for (let i = 0; i < 120; i++) {
      entries.push(
        createEntry(`id-${i}`, `uuid-${i}`, `input-${i}`, `output-${i}`),
      );
    }
    entries.unshift(createEntry("id-0", "uuid-0", "duplicate", "duplicate"));

    act(() => {
      result.current.setHistory(entries);
    });

    expect(result.current.state.history).toHaveLength(100);
    expect(
      result.current.state.history.filter((entry) => entry.uuid === "uuid-0"),
    ).toHaveLength(1);
  });

  it("addEntry prepends entry and removes existing entries with same uuid or id", () => {
    const { result } = renderHook(() => useHistoryState());

    act(() => {
      result.current.setHistory([
        createEntry("id-1", "uuid-1", "first", "out-1"),
        createEntry("id-2", "uuid-2", "second", "out-2"),
      ]);
    });

    act(() => {
      result.current.addEntry(
        createEntry("id-1", "uuid-3", "replacement by id", "new"),
      );
    });

    expect(result.current.state.history[0]).toMatchObject({
      id: "id-1",
      uuid: "uuid-3",
      input: "replacement by id",
    });
    expect(result.current.state.history).toHaveLength(2);

    act(() => {
      result.current.addEntry(
        createEntry("id-9", "uuid-2", "replacement by uuid", "new-2"),
      );
    });

    expect(result.current.state.history[0]).toMatchObject({
      id: "id-9",
      uuid: "uuid-2",
      input: "replacement by uuid",
    });
    expect(result.current.state.history).toHaveLength(2);
  });

  it("updates, removes, and clears entries", () => {
    const { result } = renderHook(() => useHistoryState());

    act(() => {
      result.current.setHistory([
        createEntry("id-1", "uuid-1", "alpha", "one"),
        createEntry("id-2", "uuid-2", "beta", "two"),
      ]);
    });

    act(() => {
      result.current.updateEntry("uuid-1", {
        output: "updated-output",
        title: "Updated",
      });
    });

    expect(result.current.state.history[0]).toMatchObject({
      uuid: "uuid-1",
      output: "updated-output",
      title: "Updated",
    });

    act(() => {
      result.current.removeEntry("id-2");
    });

    expect(result.current.state.history).toHaveLength(1);
    expect(result.current.state.history[0]?.id).toBe("id-1");

    act(() => {
      result.current.clearEntries();
    });

    expect(result.current.state.history).toEqual([]);
  });

  it("filters history by search query across input (not output)", () => {
    const { result } = renderHook(() => useHistoryState());

    act(() => {
      result.current.setHistory([
        createEntry("id-1", "uuid-1", "Sunset on mountains", "cinematic pan"),
        createEntry("id-2", "uuid-2", "Ocean shore", "Golden hour beach"),
      ]);
    });

    // "golden" only appears in output — should NOT match
    act(() => {
      result.current.setSearchQuery("golden");
    });

    expect(result.current.filteredHistory).toHaveLength(0);

    // "MOUNTAINS" appears in input — should match
    act(() => {
      result.current.setSearchQuery("MOUNTAINS");
    });

    expect(result.current.filteredHistory).toHaveLength(1);
    expect(result.current.filteredHistory[0]?.id).toBe("id-1");
  });
});
