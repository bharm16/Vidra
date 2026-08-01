import { expect, test } from "@playwright/test";
import { jsonResponse } from "./helpers/responses";
import { injectAuthUser } from "./helpers/auth";

/**
 * Library (/history) is an account-scoped surface: signed-out visitors are
 * sent to sign-in with a way back (RequireAuth, 6ace8f7b), and the signed-in
 * page renders the user's sessions and kept clips.
 *
 * Signed-in hydration is server-authoritative: getPromptRepositoryForUser
 * routes authenticated users to the sessions API (PromptRepository), not the
 * localStorage repository — so these tests seed entries by stubbing
 * GET /api/sessions with SessionDto payloads.
 */

const SESSION_DTOS = [
  {
    id: "session-e2e-1",
    updatedAt: "2026-02-15T10:00:00.000Z",
    prompt: {
      uuid: "uuid-local-1",
      title: "Ocean sunset",
      input: "A sunset over the ocean",
      output:
        "A breathtaking golden sunset over a calm turquoise ocean, cinematic wide-angle shot.",
      score: 88,
    },
  },
  {
    id: "session-e2e-2",
    updatedAt: "2026-02-14T08:30:00.000Z",
    prompt: {
      uuid: "uuid-local-2",
      title: "Park dog",
      input: "Dog in a park",
      output:
        "A playful golden retriever bounding through a sunlit park, shallow depth of field.",
      score: 82,
    },
  },
];

async function stubSessionsApi(
  page: import("@playwright/test").Page,
  sessions: unknown[] = [],
) {
  await page.route("**/api/sessions**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill(jsonResponse({ success: true, data: sessions }));
      return;
    }
    await route.fulfill(jsonResponse({ success: true, data: {} }));
  });
}

test.describe("library page", () => {
  test("signed-out /history redirects to sign-in with a way back", async ({
    page,
  }) => {
    await page.goto("/history");
    await expect(page).toHaveURL(/\/signin\?redirect=%2Fhistory/);
    await expect(
      page.getByRole("heading", { level: 1, name: /welcome back/i }),
    ).toBeVisible();
  });

  test("renders library entries from the sessions API when signed in", async ({
    page,
  }) => {
    await injectAuthUser(page);
    await stubSessionsApi(page, SESSION_DTOS);

    await page.goto("/history");

    await expect(
      page.getByRole("heading", { level: 1, name: "Library" }),
    ).toBeVisible();
    await expect(page.getByLabel("Open session: Ocean sunset")).toBeVisible();
    await expect(page.getByLabel("Open session: Park dog")).toBeVisible();
  });

  test("shows the empty state when the library has no entries", async ({
    page,
  }) => {
    await injectAuthUser(page);
    await stubSessionsApi(page, []);

    await page.goto("/history");

    await expect(
      page.getByRole("heading", { level: 1, name: "Library" }),
    ).toBeVisible();
    await expect(page.getByText("Your library is empty.")).toBeVisible();
  });

  test("search filters library entries", async ({ page }) => {
    await injectAuthUser(page);
    await stubSessionsApi(page, SESSION_DTOS);

    await page.goto("/history");

    const searchInput = page.getByLabel("Search your library");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("sunset");

    await expect(page.getByLabel("Open session: Ocean sunset")).toBeVisible();
    await expect(page.getByLabel("Open session: Park dog")).toHaveCount(0);

    await searchInput.fill("no-such-clip-anywhere");
    await expect(
      page.getByText('No results for "no-such-clip-anywhere".'),
    ).toBeVisible();
  });
});
