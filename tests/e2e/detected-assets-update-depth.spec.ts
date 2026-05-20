import { expect, test } from "@playwright/test";
import { jsonResponse, ONE_PIXEL_PNG } from "./helpers/responses";
import { injectAuthUser } from "./helpers/auth";

const MAX_DEPTH_ERROR = "Maximum update depth exceeded";

type TestAsset = {
  id: string;
  userId: string;
  type: "character" | "style" | "location" | "object";
  trigger: string;
  name: string;
  textDefinition: string;
  negativePrompt: string;
  referenceImages: Array<{
    id: string;
    url: string;
    thumbnailUrl: string;
    isPrimary: boolean;
    metadata: {
      uploadedAt: string;
      width: number;
      height: number;
      sizeBytes: number;
    };
  }>;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const characterAsset: TestAsset = {
  id: "asset-hero-1",
  userId: "user-e2e",
  type: "character",
  trigger: "@hero",
  name: "Hero",
  textDefinition: "Consistent lead character",
  negativePrompt: "",
  referenceImages: [],
  usageCount: 0,
  lastUsedAt: null,
  createdAt: "2026-02-10T00:00:00.000Z",
  updatedAt: "2026-02-10T00:00:00.000Z",
};

test("regression: detected assets prompt churn does not hit max update depth", async ({
  page,
}) => {
  await injectAuthUser(page);

  const maxDepthConsoleErrors: string[] = [];
  const maxDepthPageErrors: string[] = [];
  const assets: TestAsset[] = [];

  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && text.includes(MAX_DEPTH_ERROR)) {
      maxDepthConsoleErrors.push(text);
    }
  });

  page.on("pageerror", (error) => {
    if (error.message.includes(MAX_DEPTH_ERROR)) {
      maxDepthPageErrors.push(error.message);
    }
  });

  await page.route("**/api/assets**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();
    const getAssetMatch = pathname.match(/\/api\/assets\/([^/]+)$/);
    const uploadImageMatch = pathname.match(/\/api\/assets\/([^/]+)\/images$/);
    const setPrimaryMatch = pathname.match(
      /\/api\/assets\/([^/]+)\/images\/([^/]+)\/primary$/,
    );

    if (method === "GET" && pathname.endsWith("/api/assets")) {
      await route.fulfill(
        jsonResponse({
          assets,
          total: assets.length,
          byType: {
            character: assets.filter((asset) => asset.type === "character")
              .length,
            style: 0,
            location: 0,
            object: 0,
          },
        }),
      );
      return;
    }

    if (method === "POST" && pathname.endsWith("/api/assets")) {
      const payload = (request.postDataJSON?.() ?? {}) as {
        trigger?: string;
        name?: string;
        textDefinition?: string;
        negativePrompt?: string;
      };
      const trigger = payload.trigger?.trim() || "@hero";
      const createdAsset = {
        ...characterAsset,
        trigger: trigger.startsWith("@") ? trigger : `@${trigger}`,
        name: payload.name?.trim() || characterAsset.name,
        textDefinition:
          payload.textDefinition?.trim() || characterAsset.textDefinition,
        negativePrompt: payload.negativePrompt ?? "",
        updatedAt: new Date().toISOString(),
      };
      assets.splice(0, assets.length, createdAsset);
      await route.fulfill(jsonResponse(createdAsset));
      return;
    }

    if (method === "POST" && uploadImageMatch) {
      const [, assetId] = uploadImageMatch;
      const asset = assets.find((item) => item.id === assetId);
      if (!asset) {
        await route.fulfill(jsonResponse({ error: "Asset not found" }, 404));
        return;
      }

      const uploadedImage = {
        id: "img-hero-1",
        url: "https://example.com/hero.png",
        thumbnailUrl: "https://example.com/hero-thumb.png",
        isPrimary: true,
        metadata: {
          uploadedAt: "2026-02-10T00:00:00.000Z",
          width: 1,
          height: 1,
          sizeBytes: ONE_PIXEL_PNG.length,
        },
      };
      asset.referenceImages = [uploadedImage];
      await route.fulfill(jsonResponse({ image: uploadedImage }));
      return;
    }

    if (method === "PATCH" && setPrimaryMatch) {
      const [, assetId, imageId] = setPrimaryMatch;
      const asset = assets.find((item) => item.id === assetId);
      if (!asset) {
        await route.fulfill(jsonResponse({ error: "Asset not found" }, 404));
        return;
      }

      asset.referenceImages = asset.referenceImages.map((image) => ({
        ...image,
        isPrimary: image.id === imageId,
      }));
      await route.fulfill(jsonResponse(asset));
      return;
    }

    if (method === "GET" && getAssetMatch) {
      const [, assetId] = getAssetMatch;
      const asset = assets.find((item) => item.id === assetId);
      if (!asset) {
        await route.fulfill(jsonResponse({ error: "Asset not found" }, 404));
        return;
      }
      await route.fulfill(jsonResponse(asset));
      return;
    }

    if (method === "DELETE" && getAssetMatch) {
      const [, assetId] = getAssetMatch;
      const index = assets.findIndex((item) => item.id === assetId);
      if (index >= 0) {
        assets.splice(index, 1);
      }
      await route.fulfill(jsonResponse({ success: true }));
      return;
    }

    await route.fallback();
  });

  await page.route("**/api/sessions**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (request.method() === "GET" && pathname.endsWith("/api/sessions")) {
      await route.fulfill(jsonResponse({ success: true, data: [] }));
      return;
    }

    await route.fulfill(jsonResponse({ success: true, data: {} }));
  });

  await page.goto("/");

  const promptInput = page.getByLabel("Optimized prompt");
  await expect(promptInput).toBeVisible({ timeout: 15000 });

  await promptInput.fill("@hero");

  const createFromTrigger = page.getByRole("button", {
    name: "@hero (create?)",
    exact: true,
  });
  await expect(createFromTrigger).toBeVisible();
  await createFromTrigger.click();

  await expect(
    page.getByRole("heading", { name: "Create Character" }),
  ).toBeVisible();
  const createCharacterDialog = page.getByRole("dialog", {
    name: "Create Character",
  });
  await page.getByPlaceholder("Marcus Chen").fill("Hero");
  await createCharacterDialog.locator('input[type="file"]').setInputFiles({
    name: "hero.png",
    mimeType: "image/png",
    buffer: ONE_PIXEL_PNG,
  });
  await expect(
    page.getByRole("button", { name: "Create @hero", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Create @hero", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Create Character" }),
  ).toHaveCount(0);

  const assetChip = page.getByRole("button", { name: "@hero", exact: true });
  await expect(assetChip).toBeVisible();

  for (let i = 0; i < 12; i += 1) {
    await assetChip.hover();
    await promptInput.fill("");
    await expect(assetChip).toHaveCount(0);
    await promptInput.fill("@hero");
    await expect(assetChip).toBeVisible();
  }

  await expect(page.getByText("Application Error")).toHaveCount(0);
  expect(maxDepthConsoleErrors).toEqual([]);
  expect(maxDepthPageErrors).toEqual([]);
});
