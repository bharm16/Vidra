import { describe, expect, it } from "vitest";
import {
  createOwnedMediaReference,
  parseOwnedMediaReference,
  resolveOwnedMediaPath,
} from "../OwnedMediaReference";

describe("owned-media references", () => {
  it("keeps a generic storage object's owner path on the server", () => {
    const reference = createOwnedMediaReference(
      "preview-image",
      "users/user-a/previews/images/1700000000-abcd.webp",
    );

    expect(reference).toBe("om1.preview-image.1700000000-abcd.webp");
    expect(resolveOwnedMediaPath("user-a", reference)).toBe(
      "users/user-a/previews/images/1700000000-abcd.webp",
    );
    expect(resolveOwnedMediaPath("user-b", reference)).toBe(
      "users/user-b/previews/images/1700000000-abcd.webp",
    );
  });

  it("rejects path-shaped and malformed references", () => {
    expect(parseOwnedMediaReference("users/user-a/generations/file.mp4")).toBeNull();
    expect(parseOwnedMediaReference("om1.generation../file.mp4")).toBeNull();
  });
});
