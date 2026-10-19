import { renderHook, waitFor, act } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ProjectSchema } from "@shared/schemas/workflow/project.schemas";
import { useLibraryEntry } from "../hooks/useLibraryEntry";

vi.mock("../api/workflowApi", () => ({ WorkflowApi: class {} }));

const library = ProjectSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "project_library_abc", ownerId: "creator", revision: 1, name: "Library", status: "active", instructions: { revision: 1, text: "" }, origin: { kind: "new" }, role: "library", createdAt: "2026-10-19T00:00:00.000Z", updatedAt: "2026-10-19T00:00:00.000Z" });

it("opens the owner's library and retries after a failure", async () => {
  const failure = Object.assign(new Error("Your work could not open."), { status: 503 });
  const api = { ensureLibrary: vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(library) };
  const { result } = renderHook(() => useLibraryEntry("creator", api));
  await waitFor(() => expect(result.current.error).toEqual({ message: "Your work could not open.", status: 503 }));
  expect(result.current.library).toBeUndefined();
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.library).toEqual(library));
  expect(result.current.error).toBeUndefined();
  expect(api.ensureLibrary).toHaveBeenCalledTimes(2);
});

it("never shows one account's library after switching to another", async () => {
  let resolveFirst: (value: typeof library) => void = () => undefined;
  const api = { ensureLibrary: vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; })).mockImplementationOnce(() => new Promise(() => undefined)) };
  const { result, rerender } = renderHook(({ owner }) => useLibraryEntry(owner, api), { initialProps: { owner: "creator" } });
  rerender({ owner: "someone-else" });
  act(() => resolveFirst(library));
  await waitFor(() => expect(api.ensureLibrary).toHaveBeenCalledTimes(2));
  expect(result.current.library).toBeUndefined();
});
