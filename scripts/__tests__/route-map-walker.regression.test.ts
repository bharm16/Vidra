import { describe, expect, it } from "vitest";
import { extractRoutes } from "../lib/route-map-walker.ts";

/**
 * ROUTE_MAP.md and architecture-map.json are CI-enforced artifacts, so a walker
 * that over- or under-reports silently publishes a wrong "source of truth".
 *
 * The invariant: an emitted row corresponds to exactly one real route
 * registration. Two ways that broke:
 *
 *  1. Method name alone decided what was a route, so any `.get("...")` counted —
 *     `req.get("Idempotency-Key")` and `searchParams.get("X-Goog-Signature")`
 *     were published as routes.
 *  2. A factory argument of `router.use("/sub", createSubRoutes(dep))` was
 *     descended twice — once at "/sub" and again at the parent prefix — so every
 *     sub-router's routes were also emitted under the wrong mount.
 */
describe("route-map walker (regression)", () => {
  const routes = extractRoutes();

  it("emits no row whose path segment is a header or query-parameter name", () => {
    const nonRoutePaths = routes.filter(
      (r) =>
        r.fullPath.includes("X-Goog-Signature") ||
        r.fullPath.includes("Idempotency-Key"),
    );

    expect(nonRoutePaths).toEqual([]);
  });

  it("never attributes one method+path to more than one source file", () => {
    const sourcesByRoute = new Map<string, Set<string>>();
    for (const route of routes) {
      const key = `${route.method} ${route.fullPath}`;
      const sources = sourcesByRoute.get(key) ?? new Set<string>();
      sources.add(route.sourceFile);
      sourcesByRoute.set(key, sources);
    }

    const contested = [...sourcesByRoute.entries()]
      .filter(([, sources]) => sources.size > 1)
      .map(([key, sources]) => `${key} <- ${[...sources].join(", ")}`);

    expect(contested).toEqual([]);
  });

  it("still follows a router factory that delegates to another factory", () => {
    // server/src/routes/suggestions.ts returns createSuggestionsRouter(handlers)
    // rather than registering routes itself. A walker that only inlines calls
    // taking the router as their first argument drops these entirely.
    const paths = routes.map((r) => `${r.method} ${r.fullPath}`);

    expect(paths).toContain("GET /api/suggestions/rubrics");
    expect(paths).toContain("POST /api/suggestions/evaluate");
  });

  it("mounts each sub-router only under its own prefix", () => {
    const paths = routes.map((r) => `${r.method} ${r.fullPath}`);

    // sessions.routes.ts is mounted at /api/sessions only — never bare at /api.
    expect(paths).toContain(
      "POST /api/sessions/:sessionId/generations/:generationId/archive",
    );
    expect(paths).not.toContain(
      "POST /api/:sessionId/generations/:generationId/archive",
    );
  });
});
