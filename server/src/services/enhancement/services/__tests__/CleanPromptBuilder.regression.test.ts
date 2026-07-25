import { describe, expect, it } from "vitest";
import { CleanPromptBuilder } from "../CleanPromptBuilder";

describe("CleanPromptBuilder regression", () => {
  const builder = new CleanPromptBuilder();

  it("enforces alternative shot-size guidance for shot.type and filters generic micro guidance leakage", () => {
    const prompt = builder.buildRewritePrompt({
      highlightedText: "medium close",
      contextBefore: "A toddler sits in a toy car, ",
      contextAfter: ", smiling brightly.",
      fullPrompt:
        "A toddler sits in a toy car, medium close, smiling brightly.",
      highlightedCategory: "shot.type",
      phraseRole: "shot type or framing",
      isVideoPrompt: true,
      videoConstraints: {
        mode: "micro",
        minWords: 2,
        maxWords: 8,
        focusGuidance: [
          "Use precise visual modifiers (wardrobe, era, material)",
        ],
      },
      focusGuidance: ["Use precise visual modifiers (wardrobe, era, material)"],
    });

    expect(prompt).toContain(
      "GUIDANCE: This describes shot framing. Suggest DIFFERENT shot sizes",
    );
    expect(prompt).toContain("FOCUS: Suggest a DIFFERENT shot size or framing");
    expect(prompt).not.toContain("wardrobe, era, material");
  });

  it("applies body-part-specific subject.appearance guidance and removes role-level species/occupation directives", () => {
    const prompt = builder.buildRewritePrompt({
      highlightedText: "plump hands",
      contextBefore: "A joyful toddler with ",
      contextAfter: " grips the steering wheel.",
      fullPrompt: "A joyful toddler with plump hands grips the steering wheel.",
      highlightedCategory: "subject.appearance",
      phraseRole: "subject appearance detail",
      isVideoPrompt: true,
      focusGuidance: [
        "ROLE-LEVEL DIVERSITY: suggest fundamentally DIFFERENT subjects that fill the same narrative role — different species, occupation, age group, or archetype. Never swap synonyms (child→kid→tot).",
      ],
    });

    expect(prompt).toContain("GUIDANCE: This describes a body part.");
    expect(prompt).toContain("FOCUS: Suggest a DIFFERENT body part");
    expect(prompt).not.toContain("different species");
    expect(prompt).not.toContain("different occupation");
  });

  it("emits angle-only guidance for camera.angle spans", () => {
    const prompt = builder.buildRewritePrompt({
      highlightedText: "eye level",
      contextBefore: "Cinematic ",
      contextAfter: " drawing the viewer in.",
      fullPrompt: "Cinematic eye level drawing the viewer in.",
      highlightedCategory: "camera.angle",
      phraseRole: "camera angle",
      isVideoPrompt: true,
      videoConstraints: {
        mode: "micro",
        minWords: 1,
        maxWords: 6,
        focusGuidance: [
          "Pair a camera move with a lens choice and framing detail",
        ],
      },
    });

    expect(prompt).toContain("GUIDANCE: This describes camera angle.");
    expect(prompt).toContain("FOCUS: Suggest only angle or viewpoint changes.");
    expect(prompt).not.toContain("Pair a camera move with a lens choice");
  });

  it("emits movement-only guidance for camera.movement spans", () => {
    const prompt = builder.buildRewritePrompt({
      highlightedText: "slowly zooming in",
      contextBefore: "Medium close-up, eye-level shot, ",
      contextAfter: " on a toddler.",
      fullPrompt:
        "Medium close-up, eye-level shot, slowly zooming in on a toddler.",
      highlightedCategory: "camera.movement",
      phraseRole: "camera movement",
      isVideoPrompt: true,
      videoConstraints: {
        mode: "phrase",
        minWords: 1,
        maxWords: 6,
        focusGuidance: [
          "Include a lens or focal length",
          "Reference camera movement",
        ],
      },
    });

    expect(prompt).toContain("GUIDANCE: This describes camera movement.");
    expect(prompt).toContain(
      "FOCUS: Use a camera move or support-style phrase only.",
    );
    expect(prompt).not.toContain("Include a lens or focal length");
  });

  it("emits time-of-day-only guidance for lighting.timeOfDay spans", () => {
    const prompt = builder.buildRewritePrompt({
      highlightedText: "golden hour sunlight",
      contextBefore: "Warm, ",
      contextAfter: " streams through the car windows.",
      fullPrompt: "Warm, golden hour sunlight streams through the car windows.",
      highlightedCategory: "lighting.timeOfDay",
      phraseRole: "time of day",
      isVideoPrompt: true,
      videoConstraints: {
        mode: "adjective",
        minWords: 1,
        maxWords: 5,
        focusGuidance: [
          "Do not describe source direction, flare, lensing, or shadow behavior",
        ],
      },
    });

    expect(prompt).toContain("GUIDANCE: This describes time of day.");
    expect(prompt).toContain(
      "FOCUS: Suggest only a different time period or daylight condition.",
    );
    expect(prompt).toContain(
      "Do not turn the slot into a lighting-direction or post-processing phrase.",
    );
  });

  it("emits in-scene context guidance for environment.context spans", () => {
    const prompt = builder.buildRewritePrompt({
      highlightedText: "car's front window",
      contextBefore: "with the soft blur of a park view visible through the ",
      contextAfter: ", creating a sense of intimate observation.",
      fullPrompt:
        "with the soft blur of a park view visible through the car's front window, creating a sense of intimate observation.",
      highlightedCategory: "environment.context",
      phraseRole: "environment detail",
      isVideoPrompt: true,
      videoConstraints: {
        mode: "phrase",
        minWords: 2,
        maxWords: 8,
        focusGuidance: ["Mention time of day or atmospheric detail"],
      },
    });

    expect(prompt).toContain(
      "GUIDANCE: This describes in-scene environmental context.",
    );
    expect(prompt).toContain(
      "FOCUS: Keep the replacement inside the current scene as an object, surface, or atmospheric context beat.",
    );
  });

  it("emits style-only guidance for style.aesthetic spans", () => {
    const prompt = builder.buildRewritePrompt({
      highlightedText: "creamy bokeh",
      contextBefore: "renders the background in a ",
      contextAfter: ".",
      fullPrompt:
        "The shallow depth of field renders the background in a creamy bokeh.",
      highlightedCategory: "style.aesthetic",
      phraseRole: "style or aesthetic descriptor",
      isVideoPrompt: true,
      videoConstraints: {
        mode: "adjective",
        minWords: 1,
        maxWords: 8,
        focusGuidance: [
          "NEVER suggest camera movements (dolly, pan, handheld, Steadicam, gimbal, tracking)",
        ],
      },
    });

    expect(prompt).toContain("GUIDANCE: This describes visual treatment.");
    expect(prompt).toContain(
      "FOCUS: Keep the output scoped to visual treatment, color, medium, or post-processing.",
    );
    expect(prompt).not.toContain("Steadicam");
  });
});
