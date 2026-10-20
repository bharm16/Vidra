/**
 * Shared response builders for E2E tests.
 *
 * These helpers construct the route-fulfill payloads that Playwright's
 * `page.route()` expects, eliminating duplication across spec files.
 */

export const jsonResponse = (body: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});
