import { Readable, Writable } from "node:stream";
import type { Response } from "express";
import { describe, expect, it } from "vitest";
import { VIDEO_MODELS } from "@config/modelConfig";
import { parseVideoRequest, sendVideoContent } from "../videoRequest";

class MockResponse extends Writable {
  public headers = new Map<string, string>();
  public chunks: Buffer[] = [];
  public headersSent = false;
  public destroyError: Error | null = null;

  public setHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }

  override destroy(error?: Error): this {
    if (error) {
      this.destroyError = error;
    }
    return super.destroy(error);
  }

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.headersSent = true;
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback();
  }
}

describe("video request parser regression", () => {
  it("rejects invalid aspect ratios", () => {
    const result = parseVideoRequest({
      prompt: "Cinematic prompt",
      aspectRatio: "4:3",
      model: "sora",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "aspectRatio must be one of: 16:9, 9:16, 21:9, 1:1",
    });
  });

  it("rejects unknown model identifiers", () => {
    const result = parseVideoRequest({
      prompt: "Cinematic prompt",
      aspectRatio: "16:9",
      model: "model-that-does-not-exist",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected parse failure for unknown model");
    }
    expect(result.status).toBe(400);
    expect(result.error).toContain("Unknown model");
  });

  it("accepts known model aliases, keys, and IDs", () => {
    const acceptedModels = ["sora", "SORA_2", VIDEO_MODELS.SORA_2];

    for (const model of acceptedModels) {
      const result = parseVideoRequest({
        prompt: "Cinematic prompt",
        aspectRatio: "16:9",
        model,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        continue;
      }
      expect(result.payload.model).toBe(model);
    }
  });

  it("accepts endImage, referenceImages, and extendVideoUrl when valid", () => {
    const result = parseVideoRequest({
      prompt: "Cinematic prompt",
      endImage: "https://images.example.com/end.png",
      referenceImages: [
        { url: "https://images.example.com/ref-1.png", type: "asset" },
        { url: "https://images.example.com/ref-2.png", type: "style" },
      ],
      extendVideoUrl: "https://videos.example.com/source.mp4",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.payload.endImage).toBe("https://images.example.com/end.png");
    expect(result.payload.referenceImages).toHaveLength(2);
    expect(result.payload.extendVideoUrl).toBe(
      "https://videos.example.com/source.mp4",
    );
  });

  it("rejects empty prompt when no startImage is provided", () => {
    const missing = parseVideoRequest({});
    expect(missing).toEqual({
      ok: false,
      status: 400,
      error: "Prompt must be a non-empty string when no startImage is provided",
    });

    const blank = parseVideoRequest({ prompt: "   " });
    expect(blank).toEqual({
      ok: false,
      status: 400,
      error: "Prompt must be a non-empty string when no startImage is provided",
    });
  });

  it("accepts empty prompt when startImage is provided (i2v)", () => {
    const withMissingPrompt = parseVideoRequest({
      startImage: "https://images.example.com/start.png",
    });
    expect(withMissingPrompt.ok).toBe(true);
    if (!withMissingPrompt.ok) {
      throw new Error("Expected parse success when startImage is provided");
    }
    expect(withMissingPrompt.payload.prompt).toBe("");
    expect(withMissingPrompt.payload.startImage).toBe(
      "https://images.example.com/start.png",
    );

    const withBlankPrompt = parseVideoRequest({
      prompt: "   ",
      startImage: "https://images.example.com/start.png",
    });
    expect(withBlankPrompt.ok).toBe(true);
    if (!withBlankPrompt.ok) {
      throw new Error(
        "Expected parse success for blank prompt with startImage",
      );
    }
    expect(typeof withBlankPrompt.payload.prompt).toBe("string");
  });

  it("rejects non-string prompt regardless of startImage", () => {
    const result = parseVideoRequest({
      prompt: 123,
      startImage: "https://images.example.com/start.png",
    });
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Prompt must be a string",
    });
  });

  it("rejects invalid referenceImages payloads", () => {
    const notArray = parseVideoRequest({
      prompt: "Cinematic prompt",
      referenceImages: "bad",
    });
    expect(notArray).toEqual({
      ok: false,
      status: 400,
      error: "referenceImages must be an array",
    });

    const tooMany = parseVideoRequest({
      prompt: "Cinematic prompt",
      referenceImages: [
        { url: "https://images.example.com/1.png", type: "asset" },
        { url: "https://images.example.com/2.png", type: "asset" },
        { url: "https://images.example.com/3.png", type: "asset" },
        { url: "https://images.example.com/4.png", type: "asset" },
      ],
    });
    expect(tooMany).toEqual({
      ok: false,
      status: 400,
      error: "referenceImages supports a maximum of 3 items",
    });

    const invalidType = parseVideoRequest({
      prompt: "Cinematic prompt",
      referenceImages: [
        { url: "https://images.example.com/1.png", type: "other" },
      ],
    });
    expect(invalidType).toEqual({
      ok: false,
      status: 400,
      error: 'Each referenceImages type must be \"asset\" or \"style\"',
    });
  });
});

describe("sendVideoContent regression", () => {
  it("streams video data through pipeline and sets response headers", async () => {
    const response = new MockResponse();
    await sendVideoContent(response as unknown as Response, {
      contentType: "video/mp4",
      contentLength: 5,
      stream: Readable.from([Buffer.from("video")]),
    });

    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(response.headers.get("Content-Length")).toBe("5");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=600");
    expect(Buffer.concat(response.chunks).toString("utf8")).toBe("video");
  });

  it("destroys the response and rethrows when stream errors after headers are sent", async () => {
    const response = new MockResponse();
    const failingStream = new Readable({
      read() {
        this.push(Buffer.from("x"));
        this.destroy(new Error("stream exploded"));
      },
    });

    await expect(
      sendVideoContent(response as unknown as Response, {
        contentType: "video/mp4",
        stream: failingStream,
      }),
    ).rejects.toThrow("stream exploded");

    expect(response.headersSent).toBe(true);
    expect(response.destroyError?.message).toContain("stream exploded");
  });
});
