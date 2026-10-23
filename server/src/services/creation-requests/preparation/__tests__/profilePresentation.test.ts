import { describe, expect, it } from "vitest";
import { ACTION_REGISTRY, advancedParameters, resultVerbs, roleParameter, wordsPolicy } from "@shared/workflow/actionRegistry";
import { workflowRuntimeProfiles } from "../WorkflowCapabilityCatalog";

const runtime = { imageProviders: new Set(["replicate-flux-schnell", "replicate-flux-kontext-fast"]), videoAvailable: () => true, textAvailable: true, replicateAvailable: true, spendGuard: { qualified: (): true => true } };
const profiles = workflowRuntimeProfiles(runtime);

describe("catalog presentation", () => {
  it("describes every choice a creator can make, so a new model needs no client change", () => {
    for (const profile of profiles) {
      expect(profile.presentation, profile.id).toBeDefined();
      for (const [name, policy] of Object.entries(profile.parameters)) {
        if (policy.policy === "editable") expect(profile.presentation?.parameters[name], `${profile.id}.${name}`).toBeDefined();
      }
    }
  });

  it("gives each core chip role at most one setting per model", () => {
    for (const profile of profiles) {
      const roles = Object.values(profile.presentation?.parameters ?? {}).flatMap(shown => shown.role ? [shown.role] : []);
      expect(new Set(roles).size, profile.id).toBe(roles.length);
    }
  });

  it("puts long-tail settings under Advanced and keeps seeds out of the composer", () => {
    const wan = profiles.find(profile => profile.id === "wan-3-t2v");
    expect(wan && advancedParameters(wan).map(([name]) => name)).toEqual(["promptExpansion", "negativePrompt"]);
    const topaz = profiles.find(profile => profile.id === "topaz-video-upscale");
    expect(topaz && roleParameter(topaz, "scale")?.[0]).toBe("resolution");
  });

  it("lets words follow the profile: none for upscale and captions, a script for voiceover", () => {
    const words = (id: string): string | undefined => {
      const profile = profiles.find(candidate => candidate.id === id);
      return profile && wordsPolicy(profile.action, profile);
    };
    expect([words("topaz-image-upscale"), words("elevenlabs-scribe-v2"), words("luma-reframe-video"), words("elevenlabs-v3"), words("lyria-3")]).toEqual(["none", "none", "optional", "script", "required"]);
    expect([words("recraft-remove-background"), words("recraft-vectorize"), words("recraft-v4.1")]).toEqual(["none", "none", "required"]);
  });

  it("offers verbs on a result only where a qualified profile takes its kind", () => {
    expect(resultVerbs("audio", profiles).map(verb => verb.label)).toEqual(["Make captions"]);
    // Vectorize waits for SVG storage: its only profile is unavailable, so no picture offers it yet.
    expect(resultVerbs("image", profiles).map(verb => verb.label)).toEqual(["Edit", "Upscale", "Remove background", "Animate"]);
    const withVectorStorage = profiles.map(profile => profile.id === "recraft-vectorize" ? { ...profile, availability: "qualified" as const } : profile);
    expect(resultVerbs("image", withVectorStorage).map(verb => verb.label)).toContain("Vectorize");
    expect(resultVerbs("video", profiles).map(verb => verb.label)).toEqual(["Edit", "Extend", "Upscale", "Reframe", "Make captions"]);
    const withoutAnimate = profiles.map(profile => profile.action === "animate-image" ? { ...profile, availability: "unavailable" as const } : profile);
    expect(resultVerbs("image", withoutAnimate).map(verb => verb.label)).not.toContain("Animate");
  });

  it("registers every action a profile serves", () => {
    for (const profile of profiles) expect(ACTION_REGISTRY[profile.action], profile.id).toBeDefined();
  });
});
