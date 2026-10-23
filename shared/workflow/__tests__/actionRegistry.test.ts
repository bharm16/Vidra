import { describe, expect, it } from "vitest";
import { CreationActionSchema } from "../../schemas/workflow/draft.schemas";
import { ACTION_REGISTRY, COMPOSER_OUTPUTS, COMPOSER_TOOLS, composerOutput, composerTool, placeActions, wordsPolicy } from "../actionRegistry";

describe("action registry", () => {
  it("has one entry for every action", () => {
    expect(Object.keys(ACTION_REGISTRY).sort()).toEqual([...CreationActionSchema.options].sort());
  });

  it("orders the switch Video, Image, Voiceover, Music and puts changes on rail tools", () => {
    expect(COMPOSER_OUTPUTS.map(output => output.label)).toEqual(["Video", "Image", "Voiceover", "Music"]);
    expect(COMPOSER_TOOLS.map(tool => tool.label)).toEqual(["Upscale", "Reframe", "Captions"]);
  });

  it("lets inputs, not another control, decide what one output does", () => {
    expect(placeActions("make-video")).toEqual(["make-video", "animate-image", "edit-video", "extend-video"]);
    expect(placeActions("upscale-video")).toEqual(["upscale-image", "upscale-video"]);
    expect(placeActions("ask")).toEqual(["ask"]);
    expect(placeActions("remove-background")).toEqual(["remove-background"]);
    expect(placeActions("vectorize-image")).toEqual(["vectorize-image"]);
    expect(composerOutput("extend-video")).toBe("video");
    expect(composerTool("transcribe")).toBe("captions");
    expect(composerOutput("transcribe")).toBeUndefined();
  });

  it("reaches background removal and vectorize only from a picture's buttons", () => {
    for (const action of ["remove-background", "vectorize-image"] as const) {
      expect(ACTION_REGISTRY[action]).toMatchObject({ group: "picture", place: { kind: "result" }, words: "none", coreChips: ["model"], verb: { role: "primary" } });
      expect(composerOutput(action)).toBeUndefined();
      expect(composerTool(action)).toBeUndefined();
    }
    expect([ACTION_REGISTRY["remove-background"].label, ACTION_REGISTRY["vectorize-image"].label]).toEqual(["Remove background", "Vectorize"]);
  });

  it("falls back to the action's words for a profile captured before it declared them", () => {
    expect(wordsPolicy("upscale-image")).toBe("none");
    expect(wordsPolicy("make-image", {})).toBe("required");
    expect(wordsPolicy("make-image", { presentation: { words: "optional", parameters: {} } })).toBe("optional");
  });
});
