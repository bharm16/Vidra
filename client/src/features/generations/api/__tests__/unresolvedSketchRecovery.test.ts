import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readOwnedSessionGeneration,
  readSavedSketchTake,
} from "../sessionGenerations";
const wire = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/services/ApiClient", () => ({ apiClient: { get: wire.get } }));
function response(userId = "creator", sessionId = "session-1"): unknown {
  return {
    success: true,
    data: {
      id: sessionId,
      userId,
      prompt: {
        versions: [
          {
            versionId: "v1",
            signature: "signature",
            prompt: "A lighthouse",
            timestamp: "2026-10-03T00:00:00Z",
            generations: [
              {
                id: "take-1",
                origin: "sketchpad",
                mediaType: "image",
                status: "completed",
                mediaUrls: ["https://media.example/take"],
                model: "sketch",
              },
            ],
          },
        ],
      },
    },
  };
}
beforeEach(() => wire.get.mockReset().mockResolvedValue(response()));
describe("saved sketch take readback", () => {
  it("returns a saved clip with its actual owning words-version for runtime hydration", async () => {
    wire.get.mockResolvedValue({
      success: true,
      data: {
        id: "session-1",
        userId: "creator",
        prompt: {
          versions: [
            {
              versionId: "v2",
              signature: "signature",
              prompt: "A push-in",
              timestamp: "2026-10-03T00:00:00Z",
              generations: [
                {
                  id: "clip-1",
                  origin: "generated",
                  mediaType: "video",
                  status: "completed",
                  mediaUrls: ["https://media.example/clip"],
                  model: "sora-2",
                  jobId: "job-1",
                },
              ],
            },
          ],
        },
      },
    });
    expect(
      await readOwnedSessionGeneration("creator", "session-1", "clip-1"),
    ).toMatchObject({
      promptVersionId: "v2",
      origin: "generated",
      generation: { id: "clip-1", mediaType: "video", jobId: "job-1" },
    });
  });
  it("reads and normalizes the exact session/version/take after saving", async () => {
    expect(
      await readSavedSketchTake("creator", "session-1", "v1", "take-1"),
    ).toMatchObject({ id: "take-1", mediaType: "image" });
    expect(wire.get).toHaveBeenCalledWith("/sessions/session-1");
  });
  it.each([
    ["other", "session-1"],
    ["creator", "other-session"],
  ])("refuses foreign identity %s/%s", async (userId, sessionId) => {
    wire.get.mockResolvedValue(response(userId, sessionId));
    await expect(
      readSavedSketchTake("creator", "session-1", "v1", "take-1"),
    ).rejects.toThrow("does not belong");
  });
  it("refuses a missing take instead of applying an unconfirmed attachment", async () => {
    await expect(
      readSavedSketchTake("creator", "session-1", "v1", "missing"),
    ).rejects.toThrow("original words-version");
  });
});
