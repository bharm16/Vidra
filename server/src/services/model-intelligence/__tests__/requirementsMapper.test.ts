import { describe, it, expect } from "vitest";
import {
  deriveRequirementsFromRoles,
  mapObservationsToRequirements,
  neutralObservations,
} from "../services/requirementsMapper";
import type { PromptSpan } from "../types";

/**
 * The pure policy mapper: LLM perceptions (RequirementObservations) -> the
 * PromptRequirements flags ModelScoringService consumes. Deterministic; no LLM.
 * Perception is the LLM's job; this fixes the policy so it stays testable.
 */
describe("mapObservationsToRequirements", () => {
  describe("physics policy", () => {
    it("maps water to fluid dynamics and complex physics", () => {
      const req = mapObservationsToRequirements(
        { ...neutralObservations(), hasWater: true },
        [],
      );
      expect(req.physics.hasFluidDynamics).toBe(true);
      expect(req.physics.hasComplexPhysics).toBe(true);
    });

    it("maps fire to complex physics without fluid dynamics", () => {
      const req = mapObservationsToRequirements(
        { ...neutralObservations(), hasFire: true },
        [],
      );
      expect(req.physics.hasComplexPhysics).toBe(true);
      expect(req.physics.hasFluidDynamics).toBe(false);
    });

    it("maps particulate to particle systems and cloth to soft body", () => {
      const req = mapObservationsToRequirements(
        {
          ...neutralObservations(),
          hasParticulate: true,
          hasFlowingCloth: true,
        },
        [],
      );
      expect(req.physics.hasParticleSystems).toBe(true);
      expect(req.physics.hasSoftBodyPhysics).toBe(true);
    });

    it("treats two non-fire/water effects as complex physics", () => {
      const req = mapObservationsToRequirements(
        { ...neutralObservations(), hasFlowingCloth: true, hasCollision: true },
        [],
      );
      expect(req.physics.hasComplexPhysics).toBe(true);
    });
  });

  describe("character policy", () => {
    it("derives character kinds from the observed kinds", () => {
      const req = mapObservationsToRequirements(
        { ...neutralObservations(), characterKinds: ["animal"] },
        [],
      );
      expect(req.character.hasAnimalCharacter).toBe(true);
      expect(req.character.hasHumanCharacter).toBe(false);
      expect(req.character.hasMechanicalCharacter).toBe(false);
    });

    it("requires facial performance only for a human that shows its face", () => {
      const human = mapObservationsToRequirements(
        {
          ...neutralObservations(),
          characterKinds: ["human"],
          showsFace: true,
        },
        [],
      );
      expect(human.character.requiresFacialPerformance).toBe(true);

      const animal = mapObservationsToRequirements(
        {
          ...neutralObservations(),
          characterKinds: ["animal"],
          showsFace: true,
        },
        [],
      );
      expect(animal.character.requiresFacialPerformance).toBe(false);
    });

    it("maps speaking to lip sync and reflects an empty cast as no human", () => {
      const req = mapObservationsToRequirements(
        { ...neutralObservations(), speaks: true, characterKinds: [] },
        [],
      );
      expect(req.character.requiresLipSync).toBe(true);
      expect(req.character.hasHumanCharacter).toBe(false);
    });
  });

  describe("lighting + style + motion policy", () => {
    it("passes through lighting mood and atmospherics", () => {
      const req = mapObservationsToRequirements(
        {
          ...neutralObservations(),
          lightingMood: "dramatic",
          hasAtmospherics: true,
        },
        [],
      );
      expect(req.lighting.requirements).toBe("dramatic");
      expect(req.lighting.requiresAtmospherics).toBe(true);
    });

    it("maps style medium to mutually exclusive style flags", () => {
      const stylized = mapObservationsToRequirements(
        {
          ...neutralObservations(),
          styleMedium: "stylized",
          specificAesthetic: "anime",
        },
        [],
      );
      expect(stylized.style.isStylized).toBe(true);
      expect(stylized.style.isPhotorealistic).toBe(false);
      expect(stylized.style.hasSpecificAesthetic).toBe("anime");

      const photoreal = mapObservationsToRequirements(
        { ...neutralObservations(), styleMedium: "photoreal" },
        [],
      );
      expect(photoreal.style.isPhotorealistic).toBe(true);
      expect(photoreal.style.isStylized).toBe(false);
    });

    it("passes through camera complexity and morphing", () => {
      const req = mapObservationsToRequirements(
        {
          ...neutralObservations(),
          cameraComplexity: "complex",
          hasMorphing: true,
        },
        [],
      );
      expect(req.motion.cameraComplexity).toBe("complex");
      expect(req.motion.hasMorphing).toBe(true);
    });

    it("treats morphing as a transition (a morph is a transformation over time)", () => {
      const req = mapObservationsToRequirements(
        { ...neutralObservations(), hasMorphing: true, hasTransitions: false },
        [],
      );
      expect(req.motion.hasTransitions).toBe(true);
    });
  });

  describe("span-derived fields (deterministic, not from the LLM)", () => {
    const envSpans: PromptSpan[] = [
      { text: "a", role: "environment.location" },
      { text: "b", role: "environment.weather" },
      { text: "c", role: "environment.context" },
      { text: "d", role: "environment.location" },
    ];

    it("derives environment complexity from environment span count", () => {
      expect(
        mapObservationsToRequirements(neutralObservations(), envSpans)
          .environment.complexity,
      ).toBe("complex");
      expect(
        mapObservationsToRequirements(neutralObservations(), [
          { text: "a", role: "environment.location" },
        ]).environment.complexity,
      ).toBe("simple");
    });

    it("derives detectedCategories from span roles", () => {
      const req = mapObservationsToRequirements(neutralObservations(), [
        { text: "x", role: "subject.identity" },
        { text: "y", role: "action.movement" },
      ]);
      expect(req.detectedCategories).toEqual([
        "subject.identity",
        "action.movement",
      ]);
    });

    it("keeps the existing span-based confidence formula", () => {
      const empty = mapObservationsToRequirements(neutralObservations(), []);
      expect(empty.confidenceScore).toBeCloseTo(0.3);

      const withSpans = mapObservationsToRequirements(neutralObservations(), [
        { text: "x", role: "subject.identity", confidence: 1 },
      ]);
      // spanConfidence(0.1)*0.4 + avgConfidence(1)*0.6 = 0.64
      expect(withSpans.confidenceScore).toBeCloseTo(0.64);
    });
  });
});

/**
 * Degraded, non-regex fallback used when the classifier LLM is unavailable.
 * It derives best-effort flags from taxonomy ROLES only — no text wordlists.
 */
describe("deriveRequirementsFromRoles (LLM-unavailable fallback)", () => {
  it("treats a weather span as particles and atmospherics", () => {
    const req = deriveRequirementsFromRoles([
      { text: "snow", role: "environment.weather" },
    ]);
    expect(req.physics.hasParticleSystems).toBe(true);
    expect(req.lighting.requiresAtmospherics).toBe(true);
  });

  it("assumes a human character when a subject role is present", () => {
    const req = deriveRequirementsFromRoles([
      { text: "a cowboy", role: "subject.identity" },
    ]);
    expect(req.character.hasHumanCharacter).toBe(true);
  });

  it("derives facial performance from a subject + emotion role", () => {
    const req = deriveRequirementsFromRoles([
      { text: "a cowboy", role: "subject.identity" },
      { text: "grief", role: "subject.emotion" },
    ]);
    expect(req.character.requiresFacialPerformance).toBe(true);
    expect(req.character.emotionalIntensity).toBe("moderate");
  });

  it("derives body language and subject complexity from action roles", () => {
    const req = deriveRequirementsFromRoles([
      { text: "a cowboy", role: "subject.identity" },
      { text: "runs", role: "action.movement" },
      { text: "waving", role: "action.gesture" },
    ]);
    expect(req.character.requiresBodyLanguage).toBe(true);
    expect(req.motion.subjectComplexity).toBe("moderate");
  });

  it("returns conservative neutral flags with no spans", () => {
    const req = deriveRequirementsFromRoles([]);
    expect(req.physics.hasComplexPhysics).toBe(false);
    expect(req.character.hasHumanCharacter).toBe(false);
    expect(req.motion.cameraComplexity).toBe("static");
  });
});
