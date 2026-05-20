/**
 * Reusable API route mocks for E2E tests.
 *
 * Each function sets up `page.route()` interceptors for a specific API
 * surface so that spec files stay focused on assertions, not plumbing.
 */

import type { Page } from "@playwright/test";
import { jsonResponse } from "./responses";

/** Mock the sessions API with empty defaults. */
export async function mockSessionRoutes(page: Page): Promise<void> {
  await page.route("**/api/sessions**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    if (method === "GET" && pathname.endsWith("/api/sessions")) {
      await route.fulfill(jsonResponse({ success: true, data: [] }));
      return;
    }

    if (method === "POST" && pathname.endsWith("/api/sessions")) {
      await route.fulfill(
        jsonResponse({
          success: true,
          data: {
            id: "session_e2e",
            prompt: { uuid: "prompt_e2e", input: "" },
          },
        }),
      );
      return;
    }

    if (method === "GET" && pathname.includes("/api/sessions/by-prompt/")) {
      await route.fulfill(
        jsonResponse({ success: true, data: { id: "session_e2e" } }),
      );
      return;
    }

    if (method === "GET" && pathname.includes("/api/sessions/session_e2e")) {
      await route.fulfill(
        jsonResponse({
          success: true,
          data: {
            id: "session_e2e",
            prompt: { uuid: "prompt_e2e", input: "" },
          },
        }),
      );
      return;
    }

    if (method === "PATCH") {
      await route.fulfill(
        jsonResponse({ success: true, data: { id: "session_e2e" } }),
      );
      return;
    }

    await route.fulfill(jsonResponse({ success: true }));
  });
}
