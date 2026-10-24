import { expect, it, vi } from "vitest";
import type { Storage } from "@google-cloud/storage";
import { RetentionService } from "../services/RetentionService";

it("exposes every cloud page and keeps the owner/type scope on continuation", async () => {
  const file = (name: string): { name: string; getMetadata: () => Promise<unknown[]> } => ({ name, getMetadata: async () => [{ size: "10", contentType: "image/png", timeCreated: "2026-10-24T00:00:00Z" }] });
  const getFiles = vi.fn()
    .mockResolvedValueOnce([[file("users/creator/generations/one")], { pageToken: "next-page" }, { nextPageToken: "next-page" }])
    .mockResolvedValueOnce([[file("users/creator/generations/two")], null, {}]);
  const service = new RetentionService({ bucket: () => ({ getFiles }) } as unknown as Storage, "test");
  const first = await service.listUserFiles("creator", { type: "generation", limit: 1 });
  expect(first.nextCursor).toBe("next-page");
  const last = await service.listUserFiles("creator", { type: "generation", limit: 1, pageToken: first.nextCursor });
  expect([...first.items, ...last.items]).toMatchObject([{ storagePath: "users/creator/generations/one" }, { storagePath: "users/creator/generations/two" }]);
  expect(last.nextCursor).toBeNull();
  expect(getFiles).toHaveBeenLastCalledWith({ prefix: "users/creator/generations/", maxResults: 1, pageToken: "next-page", autoPaginate: false });
});
