/**
 * E2E auth helpers.
 *
 * Injects a mock authenticated user via `page.addInitScript()`, which runs
 * before any app JavaScript. The production code in `repositories/index.ts`
 * detects `window.__E2E_AUTH_USER__` and swaps in `MockAuthRepository`.
 */

import type { Page } from "@playwright/test";

export type E2EUser = {
  uid: string;
  email: string;
  displayName: string;
};

export const TEST_USER: E2EUser = {
  uid: process.env.E2E_USER_UID || "e2e-user-1",
  email: "e2e@example.com",
  displayName: "E2E Test User",
};

/**
 * Inject a mock authenticated user and credit balance into the page.
 * Must be called **before** `page.goto()`.
 */
export async function injectAuthUser(
  page: Page,
  user: E2EUser = TEST_USER,
  credits = 100,
): Promise<void> {
  await page.addInitScript(
    ({ user: u, credits: c }) => {
      (window as unknown as Record<string, unknown>).__E2E_AUTH_USER__ = u;
      (window as unknown as Record<string, unknown>).__E2E_CREDIT_BALANCE__ = c;
    },
    { user, credits },
  );
}
