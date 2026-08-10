import { describe, expect, it } from "vitest";
import {
  bucketNamesMatch,
  normalizeBucketName,
  parseGcsObjectUrl,
} from "../utils/gcsObjectUrl";

const OBJECT = "users/u1/previews/images/1785598164559-abc.webp";

describe("parseGcsObjectUrl", () => {
  it.each([
    [
      "path-style",
      `https://storage.googleapis.com/my-bucket/${OBJECT}`,
      "my-bucket",
    ],
    [
      "virtual-host-style",
      `https://my-bucket.storage.googleapis.com/${OBJECT}`,
      "my-bucket",
    ],
    [
      "console host",
      `https://storage.cloud.google.com/my-bucket/${OBJECT}`,
      "my-bucket",
    ],
    [
      "firebase v0",
      `https://firebasestorage.googleapis.com/v0/b/my-bucket/o/${encodeURIComponent(OBJECT)}`,
      "my-bucket",
    ],
    [
      "JSON API download",
      `https://storage.googleapis.com/download/storage/v1/b/my-bucket/o/${encodeURIComponent(OBJECT)}`,
      "my-bucket",
    ],
    ["gs scheme", `gs://my-bucket/${OBJECT}`, "my-bucket"],
  ])("resolves the %s form", (_label, url, bucket) => {
    expect(parseGcsObjectUrl(url)).toEqual({ bucket, objectPath: OBJECT });
  });

  it("keeps the signed-URL query out of the object path", () => {
    const url = `https://storage.googleapis.com/my-bucket/${OBJECT}?X-Goog-Signature=abc`;
    expect(parseGcsObjectUrl(url)?.objectPath).toBe(OBJECT);
  });

  it("decodes percent-encoded object names", () => {
    const url = "https://storage.googleapis.com/my-bucket/a%20b/c.webp";
    expect(parseGcsObjectUrl(url)?.objectPath).toBe("a b/c.webp");
  });

  it.each([
    ["a non-storage host", "https://evil.example.com/my-bucket/x.webp"],
    ["a bucket with no object", "https://storage.googleapis.com/my-bucket"],
    [
      "a host-style URL with no object",
      "https://my-bucket.storage.googleapis.com/",
    ],
    ["a malformed URL", "not-a-url"],
    ["an empty string", ""],
    [
      "a firebase URL missing its object marker",
      "https://firebasestorage.googleapis.com/v0/b/my-bucket/x/obj",
    ],
  ])("returns null for %s", (_label, url) => {
    expect(parseGcsObjectUrl(url)).toBeNull();
  });

  it("accepts a URL instance as readily as a string", () => {
    const url = new URL(`https://storage.googleapis.com/my-bucket/${OBJECT}`);
    expect(parseGcsObjectUrl(url)?.objectPath).toBe(OBJECT);
  });
});

describe("bucketNamesMatch", () => {
  it("treats the two Firebase spellings of one bucket as equal", () => {
    expect(normalizeBucketName("proj.appspot.com")).toBe("proj");
    expect(
      bucketNamesMatch("proj.appspot.com", "proj.firebasestorage.app"),
    ).toBe(true);
    expect(bucketNamesMatch("proj", "proj.appspot.com")).toBe(true);
  });

  it("does not match different buckets, or empty names", () => {
    expect(bucketNamesMatch("proj", "other")).toBe(false);
    expect(bucketNamesMatch("", "")).toBe(false);
    expect(bucketNamesMatch("  ", "proj")).toBe(false);
  });
});
