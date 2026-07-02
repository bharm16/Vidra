import { describe, it, expect } from "vitest";
import {
  AUTH_ROUTES,
  WORKSPACE_ROUTE_PREFIXES,
  WORKSPACE_ROUTES_EXACT,
  NAV_ITEMS,
} from "../constants";

describe("AppShell constants", () => {
  describe("error handling", () => {
    it("does not allow duplicate auth or workspace routes", () => {
      const authSet = new Set(AUTH_ROUTES);
      const workspaceSet = new Set(WORKSPACE_ROUTES_EXACT);

      expect(authSet.size).toBe(AUTH_ROUTES.length);
      expect(workspaceSet.size).toBe(WORKSPACE_ROUTES_EXACT.length);
    });

    it("keeps auth routes separate from workspace exact routes", () => {
      const overlaps = AUTH_ROUTES.filter((route) =>
        WORKSPACE_ROUTES_EXACT.includes(
          route as (typeof WORKSPACE_ROUTES_EXACT)[number],
        ),
      );

      expect(overlaps).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("includes expected auth routes for sign-in flow", () => {
      expect(AUTH_ROUTES).toContain("/signin");
      expect(AUTH_ROUTES).toContain("/signup");
    });

    it("defines workspace prefixes with leading slashes", () => {
      expect(WORKSPACE_ROUTE_PREFIXES.length).toBeGreaterThan(0);
      WORKSPACE_ROUTE_PREFIXES.forEach((prefix) => {
        expect(prefix.startsWith("/")).toBe(true);
      });
    });
  });

  describe("core behavior", () => {
    it("parks every marketing link out of the top nav (gallery landing nav is wordmark + auth action only)", () => {
      const topNavItems = NAV_ITEMS.filter((item) => item.showInTopNav);
      const sidebarItems = NAV_ITEMS.filter((item) => item.showInSidebar);

      expect(topNavItems).toHaveLength(0);
      expect(sidebarItems.length).toBeGreaterThan(0);
    });

    it("defines the Assets route navigation item", () => {
      const assetsItem = NAV_ITEMS.find((item) => item.to === "/assets");
      expect(assetsItem?.label).toBe("Assets");
      expect(assetsItem?.showInSidebar).toBe(true);
    });
  });
});
