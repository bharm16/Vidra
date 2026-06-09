import { describe, it, expect } from "vitest";
import { buildArchitectureMap } from "../generate-architecture-map.ts";

describe("generate-architecture-map", () => {
  it("emits a JSON object with meta, runtime, routes, featureFlags", () => {
    const map = buildArchitectureMap();
    expect(map).toMatchObject({
      meta: expect.objectContaining({ project: "Vidra" }),
      runtime: expect.objectContaining({ node: expect.any(String) }),
      routes: expect.any(Array),
      featureFlags: expect.any(Array),
    });
  });

  it("featureFlags entries include requiresEnv and dependsOn", () => {
    const map = buildArchitectureMap();
    const faceEmbedding = map.featureFlags.find(
      (f: { envName: string }) => f.envName === "ENABLE_FACE_EMBEDDING",
    );
    expect(faceEmbedding).toBeDefined();
    expect(faceEmbedding!.requiresEnv).toEqual(["REPLICATE_API_TOKEN"]);
    expect(faceEmbedding!.dependsOn).toEqual(["ENABLE_CONVERGENCE"]);
  });

  it("routes entries are non-empty", () => {
    const map = buildArchitectureMap();
    expect(map.routes.length).toBeGreaterThan(10);
  });

  it("emits DI dependency edges with from/to/file fields", async () => {
    const map = buildArchitectureMap();
    expect(map.dependencies).toBeDefined();
    expect(Array.isArray(map.dependencies)).toBe(true);
    expect(map.dependencies.length).toBeGreaterThan(10);

    // Specific edge: promptOptimizationService depends on aiService
    const edge = map.dependencies.find(
      (e: { from: string; to: string }) =>
        e.from === "promptOptimizationService" && e.to === "aiService",
    );
    expect(edge).toBeDefined();
    expect(edge!.file).toContain("optimization.services.ts");
  });

  it("each dependency edge has from, to, and file fields", () => {
    const map = buildArchitectureMap();
    for (const edge of map.dependencies) {
      expect(edge).toMatchObject({
        from: expect.any(String),
        to: expect.any(String),
        file: expect.any(String),
      });
    }
  });

  it("all route entries have concrete HTTP methods (no '*' wildcards)", () => {
    const map = buildArchitectureMap();
    const allowed = new Set([
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "HEAD",
      "OPTIONS",
    ]);
    for (const route of map.routes) {
      expect(allowed.has(route.method)).toBe(true);
    }
  });

  it("does not emit phantom routes with bare prefix paths", () => {
    const map = buildArchitectureMap();
    const phantoms = map.routes.filter(
      (r: { fullPath: string }) =>
        r.fullPath === "/api" || r.fullPath === "/" || r.fullPath === "",
    );
    expect(phantoms).toEqual([]);
  });
});
