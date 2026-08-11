import { describe, expect, it } from "vitest";
import { IntentLockService } from "../IntentLockService";

describe("IntentLockService", () => {
  const service = new IntentLockService();

  it("extracts required subject/action from shot plan when available", () => {
    const required = service.extractRequiredIntent("baby driving a car", {
      shot_type: "close-up",
      core_intent: "baby driving",
      subject: "baby",
      action: "driving a car",
    });

    expect(required.subject).toBe("baby");
    expect(required.action).toBe("driving a car");
  });

  it("uses raw prompt intent as source of truth when shot plan drifts", () => {
    const required = service.extractRequiredIntent("baby driving a car", {
      shot_type: "close-up",
      core_intent: "baby pretending to drive",
      subject: "baby",
      action: "pretending to drive a toy car",
    });

    expect(required.subject).toBe("baby");
    expect(required.action).toBe("driving a car");
  });

  it("enforces intent when subject/action are already present", () => {
    const result = service.enforceIntentLock({
      originalPrompt: "baby driving a car",
      optimizedPrompt:
        "A close-up of a baby driving a car through a sunny park.",
      shotPlan: null,
    });

    expect(result.passed).toBe(true);
    expect(result.repaired).toBe(false);
  });

  it("repairs prompt once when required subject/action are missing", () => {
    const result = service.enforceIntentLock({
      originalPrompt: "baby driving a car",
      optimizedPrompt: "A close-up in a sunny park with butterflies.",
      shotPlan: null,
    });

    expect(result.passed).toBe(true);
    expect(result.repaired).toBe(true);
    expect(result.prompt.toLowerCase()).toContain("baby");
    expect(result.prompt.toLowerCase()).toContain("driving");
  });

  it("repairs semantic downgrade from driving a car to pretending with toy car", () => {
    const result = service.enforceIntentLock({
      originalPrompt: "baby driving a car",
      optimizedPrompt:
        "A close-up of a baby pretending to drive a colorful toy car in a sunny park.",
      shotPlan: null,
    });

    expect(result.passed).toBe(true);
    expect(result.repaired).toBe(true);
    expect(result.prompt.toLowerCase()).not.toContain("pretending to drive");
    expect(result.prompt.toLowerCase()).not.toContain("toy car");
    expect(result.prompt.toLowerCase()).toContain("driving a car");
  });

  it("repairs semantic downgrade when object modifier is hyphenated", () => {
    const result = service.enforceIntentLock({
      originalPrompt: "baby driving a car",
      optimizedPrompt:
        "A baby joyfully driving a toy-like car through a sunny park.",
      shotPlan: null,
    });

    expect(result.passed).toBe(true);
    expect(result.repaired).toBe(true);
    expect(result.prompt.toLowerCase()).not.toContain("toy-like car");
    expect(result.prompt.toLowerCase()).toContain("driving a car");
  });

  it("allows qualified actions when user explicitly asks for pretending", () => {
    const result = service.enforceIntentLock({
      originalPrompt: "baby pretending to drive a toy car",
      optimizedPrompt:
        "A close-up of a baby pretending to drive a bright toy car in a sunny park.",
      shotPlan: null,
    });

    expect(result.passed).toBe(true);
    expect(result.repaired).toBe(false);
  });

  // Reachable: shot-plan context sentences are appended without a semantics
  // check, so a plan whose setting carries a downgrade modifier ("toy car
  // showroom") can reintroduce exactly what the lock exists to strip. This used
  // to throw, which turned a completed two-LLM-call optimization into a 500 on
  // the main authoring loop. The lock now reports failure and hands back the
  // model's own prompt.
  it("reports failure instead of throwing when repair cannot preserve semantics", () => {
    const candidate = "A close-up in a sunny park with butterflies.";

    const result = service.enforceIntentLock({
      originalPrompt: "baby driving a car",
      optimizedPrompt: candidate,
      shotPlan: {
        shot_type: "close-up",
        core_intent: "baby driving",
        setting: "a toy car showroom",
      },
    });

    expect(result.passed).toBe(false);
    expect(result.repaired).toBe(false);
    expect(result.prompt).toBe(candidate);
    expect(result.required).toEqual({
      subject: "baby",
      action: "driving a car",
    });
  });

  it("repairs sitting-in-driver-seat drift for driving intent", () => {
    const result = service.enforceIntentLock({
      originalPrompt: "baby driving a car",
      optimizedPrompt:
        "A baby sitting in the driver's seat of a car in a sunny park.",
      shotPlan: null,
    });

    expect(result.passed).toBe(true);
    expect(result.repaired).toBe(true);
    expect(result.prompt.toLowerCase()).toContain("driving");
  });
});
