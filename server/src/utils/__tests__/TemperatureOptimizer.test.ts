import { describe, expect, it } from "vitest";
import { TemperatureOptimizer } from "../TemperatureOptimizer";

describe("TemperatureOptimizer", () => {
  describe("edge cases", () => {
    it("clamps temperature to minimum 0.0 when adjustments push below", () => {
      // Classification (0.1) with low diversity (-0.1) and maximum precision (-0.2) = -0.2
      const result = TemperatureOptimizer.getOptimalTemperature(
        "classification",
        {
          diversity: "low",
          precision: "maximum",
        },
      );

      expect(result).toBe(0.0);
    });

    it("clamps temperature to maximum 1.0 when adjustments push above", () => {
      // Brainstorming (0.9) with maximum diversity (+0.2) and low precision (+0.1) = 1.2
      const result = TemperatureOptimizer.getOptimalTemperature(
        "brainstorming",
        {
          diversity: "maximum",
          precision: "low",
        },
      );

      expect(result).toBe(1.0);
    });
  });

  describe("getOptimalTemperature", () => {
    describe("deterministic tasks (0.0-0.3)", () => {
      it("returns low temperature for scene-detection tasks", () => {
        const result =
          TemperatureOptimizer.getOptimalTemperature("scene-detection");

        expect(result).toBe(0.2);
      });
    });

    describe("creative tasks (0.7-1.0)", () => {
      it("returns high temperature for enhancement tasks", () => {
        const result =
          TemperatureOptimizer.getOptimalTemperature("enhancement");

        expect(result).toBe(0.7);
      });
    });

    describe("diversity adjustments", () => {
      it("increases temperature for high diversity", () => {
        const base = TemperatureOptimizer.getOptimalTemperature("general");
        const result = TemperatureOptimizer.getOptimalTemperature("general", {
          diversity: "high",
        });

        expect(result).toBe(base + 0.1);
      });
    });

    describe("precision adjustments", () => {
      it("decreases temperature for high precision", () => {
        const base = TemperatureOptimizer.getOptimalTemperature("general");
        const result = TemperatureOptimizer.getOptimalTemperature("general", {
          precision: "high",
        });

        expect(result).toBe(base - 0.1);
      });

      it("significantly decreases temperature for maximum precision", () => {
        const base = TemperatureOptimizer.getOptimalTemperature("general");
        const result = TemperatureOptimizer.getOptimalTemperature("general", {
          precision: "maximum",
        });

        expect(result).toBe(base - 0.2);
      });
    });
  });
});
