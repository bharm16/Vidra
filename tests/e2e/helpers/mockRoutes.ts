/**
 * Reusable API route mocks for E2E tests.
 *
 * Each function sets up `page.route()` interceptors for a specific API
 * surface so that spec files stay focused on assertions, not plumbing.
 */

import type { Page } from "@playwright/test";
import { jsonResponse } from "./responses";

export interface MockSessionRoutesOptions {
  /** Session id echoed by create/by-prompt/by-id/PATCH. */
  sessionId?: string;
  /** Prompt uuid carried on the session's prompt. */
  promptUuid?: string;
  /** Prompt input returned from POST /api/sessions (the created draft). */
  createInput?: string;
  /** Prompt input returned from GET /api/sessions/:id (the loaded session). */
  loadedInput?: string;
  /** Invoked on every mutation (POST/PATCH) — lets specs count writes. */
  onMutation?: () => void;
}

/**
 * Mock the sessions API. Defaults give an empty, freshly-created session;
 * options cover the variations specs used to hand-roll (workspace-smoke
 * carried a byte-level copy of this cascade differing only in ids, prompt
 * text, and a mutation counter).
 */
export async function mockSessionRoutes(
  page: Page,
  {
    sessionId = "session_e2e",
    promptUuid = "prompt_e2e",
    createInput = "",
    loadedInput,
    onMutation,
  }: MockSessionRoutesOptions = {},
): Promise<void> {
  const loaded = loadedInput ?? createInput;
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
      onMutation?.();
      await route.fulfill(
        jsonResponse({
          success: true,
          data: {
            id: sessionId,
            prompt: { uuid: promptUuid, input: createInput },
          },
        }),
      );
      return;
    }

    if (method === "GET" && pathname.includes("/api/sessions/by-prompt/")) {
      await route.fulfill(
        jsonResponse({ success: true, data: { id: sessionId } }),
      );
      return;
    }

    if (method === "GET" && pathname.includes(`/api/sessions/${sessionId}`)) {
      await route.fulfill(
        jsonResponse({
          success: true,
          data: {
            id: sessionId,
            prompt: { uuid: promptUuid, input: loaded },
          },
        }),
      );
      return;
    }

    if (method === "PATCH") {
      onMutation?.();
      await route.fulfill(
        jsonResponse({ success: true, data: { id: sessionId } }),
      );
      return;
    }

    await route.fulfill(jsonResponse({ success: true }));
  });
}
