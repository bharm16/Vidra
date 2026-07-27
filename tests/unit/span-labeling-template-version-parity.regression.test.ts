/**
 * Regression: the span-labeling wire values must be identical on both sides.
 *
 * Bug: `templateVersion` was defined in four separate vocabularies. The canvas
 * (the production caller) sent `"v2.1"` from `client/src/config/performance.config.ts`,
 * which overrode the feature default `"v2.3"`. The server hashes `templateVersion`
 * into its cache key, so every production request keyed a namespace the server
 * default never wrote to — a permanent 0% cache hit rate. The policy had the same
 * shape of drift: the client sent `nonTechnicalWordLimit: 6` while the server (and
 * therefore every evaluation) defaulted to `15`, so evals validated under a looser
 * limit than production enforced.
 *
 * Invariant: there is exactly ONE source for each wire value, and both sides
 * resolve to it. This test fails on drift, not on any particular string.
 */

import { describe, it, expect } from "vitest";
import {
  SPAN_LABELING_DEFAULT_POLICY,
  SPAN_LABELING_TEMPLATE_VERSIONS,
} from "#shared/spanLabeling.ts";
import {
  DEFAULT_OPTIONS as SERVER_DEFAULT_OPTIONS,
  DEFAULT_POLICY as SERVER_DEFAULT_POLICY,
} from "@llm/span-labeling/config/SpanLabelingConfig";
import { PROMPT_VERSIONS } from "@llm/span-labeling/promptVersions";
import {
  DEFAULT_OPTIONS as CLIENT_DEFAULT_OPTIONS,
  DEFAULT_POLICY as CLIENT_DEFAULT_POLICY,
} from "@features/span-highlighting/config/constants";
import * as performanceConfig from "@/config/performance.config";

describe("span labeling wire contract parity", () => {
  describe("templateVersion", () => {
    it("client default and server default are the same value", () => {
      expect(CLIENT_DEFAULT_OPTIONS.templateVersion).toBe(
        SERVER_DEFAULT_OPTIONS.templateVersion,
      );
    });

    it("both sides resolve to the shared contract", () => {
      expect(SERVER_DEFAULT_OPTIONS.templateVersion).toBe(
        SPAN_LABELING_TEMPLATE_VERSIONS.STANDARD,
      );
      expect(CLIENT_DEFAULT_OPTIONS.templateVersion).toBe(
        SPAN_LABELING_TEMPLATE_VERSIONS.STANDARD,
      );
    });

    it("the logged prompt version derives from the template that ran", () => {
      expect(PROMPT_VERSIONS.SPAN_LABELING).toContain(
        SPAN_LABELING_TEMPLATE_VERSIONS.STANDARD,
      );
      expect(PROMPT_VERSIONS.I2V_SPAN_LABELING).toBe(
        SPAN_LABELING_TEMPLATE_VERSIONS.I2V,
      );
    });

    it("the I2V identifier still routes to the I2V template branch", () => {
      // buildSystemPrompt selects the I2V template by this prefix.
      expect(
        SPAN_LABELING_TEMPLATE_VERSIONS.I2V.toLowerCase().startsWith("i2v"),
      ).toBe(true);
      expect(
        SPAN_LABELING_TEMPLATE_VERSIONS.STANDARD.toLowerCase().startsWith(
          "i2v",
        ),
      ).toBe(false);
    });

    it("performance.config no longer carries a competing template vocabulary", () => {
      // performance.config is a UI perf-tuning file, not a contract file.
      // Re-adding template versions here is what caused the original drift.
      expect(Object.keys(performanceConfig)).not.toContain("TEMPLATE_VERSIONS");
    });
  });

  describe("labeling policy", () => {
    it("client and server agree on nonTechnicalWordLimit", () => {
      expect(CLIENT_DEFAULT_POLICY.nonTechnicalWordLimit).toBe(
        SERVER_DEFAULT_POLICY.nonTechnicalWordLimit,
      );
    });

    it("client and server agree on allowOverlap", () => {
      expect(CLIENT_DEFAULT_POLICY.allowOverlap).toBe(
        SERVER_DEFAULT_POLICY.allowOverlap,
      );
    });

    it("both sides resolve to the shared contract", () => {
      expect(SERVER_DEFAULT_POLICY).toEqual(SPAN_LABELING_DEFAULT_POLICY);
      expect(CLIENT_DEFAULT_POLICY).toEqual(SPAN_LABELING_DEFAULT_POLICY);
    });

    it("performance.config no longer carries a competing policy default", () => {
      expect(Object.keys(performanceConfig)).not.toContain(
        "DEFAULT_LABELING_POLICY",
      );
    });
  });
});
