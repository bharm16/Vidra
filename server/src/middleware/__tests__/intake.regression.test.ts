import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiErrorResponseSchema } from "@shared/schemas/api.schemas";
import { handle, requireBody, requireCreatorId } from "../intake";
import { createShareRouter } from "@routes/share.routes";
import { createStorageRoutes } from "@routes/storage.routes";
import { createAssetRoutes } from "@routes/asset.routes";
import type { ShareService } from "@services/share/ShareService";
import type { StorageRoutesService } from "@routes/storage.routes";
import type { AssetService } from "@services/asset/AssetService";

/**
 * Invariant: there is exactly ONE 401 body and exactly ONE 400 body on this
 * server, and both come out of `respond`.
 *
 * Before the intake seam these routes disagreed in ways a client could see:
 *
 *   share.routes.ts       400 {success,error:"Invalid share request"}
 *                             — no `code`, no `details`, no `requestId`
 *   storage.routes.ts     401 via a private resolveUserId + rejectAnonymous
 *   asset.routes.ts       400 {success,error:"prompt is required"} — no `code`,
 *                             and POST / validated NOTHING at all
 *   roleClassifyRoute.ts  400 {error:"Invalid request format"} — no `success`,
 *                             which the client's discriminated union rejects
 *   sessions/continuity   400 details: ZodIssue[] — an ARRAY, though the shared
 *                             contract types `details` as a string
 *
 * The tests below pin the collapsed shapes across previously-divergent routes.
 */

interface ErrorWithCode {
  code?: string;
  message?: string;
}

const isSocketPermissionError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as ErrorWithCode;
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message =
    typeof candidate.message === "string" ? candidate.message : "";
  if (code === "EPERM" || code === "EACCES") return true;
  return (
    message.includes("listen EPERM") ||
    message.includes("listen EACCES") ||
    message.includes("operation not permitted") ||
    message.includes("Cannot read properties of null (reading 'port')")
  );
};

const runSupertestOrSkip = async <T>(
  execute: () => Promise<T>,
): Promise<T | null> => {
  if (process.env.CODEX_SANDBOX === "seatbelt") return null;
  try {
    return await execute();
  } catch (error) {
    if (isSocketPermissionError(error)) return null;
    throw error;
  }
};

const shareService = (): ShareService =>
  ({
    mint: vi.fn(async () => ({ shareId: "s1", url: "/c/s1" })),
  }) as unknown as ShareService;

const storageService = (): StorageRoutesService =>
  ({
    getUploadUrl: vi.fn(async () => ({ url: "u" })),
    getStorageUsage: vi.fn(async () => ({ bytes: 0 })),
  }) as unknown as StorageRoutesService;

const assetService = (): AssetService =>
  ({
    createAsset: vi.fn(async () => ({ id: "a1" })),
    resolvePrompt: vi.fn(async () => ({ resolved: "x" })),
  }) as unknown as AssetService;

/** Mount a router with an optional signed-in Creator. */
const mount = (
  path: string,
  router: express.Router,
  uid?: string,
): express.Express => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request & { id?: string }).id = "req-fixed";
    if (uid !== undefined) {
      (req as express.Request & { user?: { uid?: string } }).user = { uid };
    }
    next();
  });
  app.use(path, router);
  return app;
};

describe("intake — one 401 shape across previously-divergent routes", () => {
  const cases: Array<{
    name: string;
    build: () => express.Express;
    send: (app: express.Express) => request.Test;
  }> = [
    {
      name: "share.routes (was requireUserId + bespoke 400)",
      build: () => mount("/share", createShareRouter(shareService())),
      send: (app) => request(app).post("/share").send({ clipId: "c1" }),
    },
    {
      name: "storage.routes (was resolveUserId + rejectAnonymous)",
      build: () => mount("/storage", createStorageRoutes(storageService())),
      send: (app) => request(app).get("/storage/usage"),
    },
    {
      name: "asset.routes (was requireUserId, no body validation)",
      build: () => mount("/assets", createAssetRoutes(assetService())),
      send: (app) => request(app).post("/assets").send({}),
    },
  ];

  for (const { name, build, send } of cases) {
    it(`${name} returns the canonical 401`, async () => {
      const response = await runSupertestOrSkip(() => send(build()));
      if (!response) return;

      expect(response.status).toBe(401);
      const parsed = ApiErrorResponseSchema.parse(response.body);
      expect(parsed).toEqual({
        success: false,
        error: "Authentication required",
        code: "AUTH_REQUIRED",
        requestId: "req-fixed",
      });
    });
  }
});

describe("intake — one 400 shape across previously-divergent routes", () => {
  const cases: Array<{
    name: string;
    build: () => express.Express;
    send: (app: express.Express) => request.Test;
  }> = [
    {
      name: "share.routes (was 'Invalid share request', no code)",
      build: () => mount("/share", createShareRouter(shareService()), "u1"),
      send: (app) => request(app).post("/share").send({}),
    },
    {
      name: "asset.routes POST / (validated nothing — 500 on a missing field)",
      build: () => mount("/assets", createAssetRoutes(assetService()), "u1"),
      send: (app) => request(app).post("/assets").send({ type: "character" }),
    },
    {
      name: "asset.routes POST /resolve (was 'prompt is required', no code)",
      build: () => mount("/assets", createAssetRoutes(assetService()), "u1"),
      send: (app) => request(app).post("/assets/resolve").send({}),
    },
  ];

  for (const { name, build, send } of cases) {
    it(`${name} returns the canonical 400`, async () => {
      const response = await runSupertestOrSkip(() => send(build()));
      if (!response) return;

      expect(response.status).toBe(400);
      const parsed = ApiErrorResponseSchema.parse(response.body);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("Invalid request");
      expect(parsed.code).toBe("INVALID_REQUEST");
      expect(parsed.requestId).toBe("req-fixed");
      // The shared contract types `details` as a string; two routes used to
      // ship the raw ZodIssue[] here.
      expect(typeof parsed.details).toBe("string");
    });
  }
});

describe("intake — every invalid field is reported", () => {
  const FourFieldSchema = z.object({
    alpha: z.string(),
    bravo: z.number(),
    charlie: z.boolean(),
    delta: z.string().email(),
  });

  it("a body with four bad fields names all four", async () => {
    const app = express();
    app.use(express.json());
    app.post(
      "/four",
      handle({ auth: "anonymous", body: FourFieldSchema }, () => ({
        ok: true,
      })),
    );

    const response = await runSupertestOrSkip(() =>
      request(app)
        .post("/four")
        .send({ alpha: 1, bravo: "two", charlie: "three", delta: "not-email" }),
    );
    if (!response) return;

    expect(response.status).toBe(400);
    const details = ApiErrorResponseSchema.parse(response.body).details ?? "";
    for (const field of ["alpha", "bravo", "charlie", "delta"]) {
      expect(details).toContain(field);
    }
  });
});

describe("intake — the identity rule", () => {
  const creatorOf = (uid?: string): string | null => {
    const req = { path: "/t" } as express.Request;
    if (uid !== undefined) {
      (req as express.Request & { user?: { uid?: string } }).user = { uid };
    }
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as express.Response;
    return requireCreatorId(req, res);
  };

  it("accepts a Firebase uid", () => {
    expect(creatorOf("abc123")).toBe("abc123");
  });

  it("accepts the api-key pseudo-uid apiAuth mints", () => {
    expect(creatorOf("api-key:secret")).toBe("api-key:secret");
  });

  it("rejects a missing user", () => {
    expect(creatorOf()).toBeNull();
  });

  /**
   * Regression: `extractUserId` (utils/requestHelpers.ts) substitutes the
   * literal "anonymous" for a missing user, and a rate-limit key is an IP.
   * `storage.routes.ts` and four preview handlers each carried a private guard
   * against both; the other ~30 authenticated routes carried none. The guard is
   * now the single definition, so no route can mistake either for an identity.
   */
  it.each(["anonymous", "203.0.113.7", "2001:db8::1", "", "   "])(
    "rejects %j as a Creator identity",
    (uid) => {
      expect(creatorOf(uid)).toBeNull();
    },
  );
});

describe("intake — handle() does not invent a success envelope", () => {
  it("leaves a handler's own response untouched", async () => {
    const app = express();
    app.use(express.json());
    app.post(
      "/bare",
      handle({ auth: "anonymous" }, ({ res }) => {
        res.status(201).json({ spans: [] });
      }),
    );

    const response = await runSupertestOrSkip(() =>
      request(app).post("/bare").send({}),
    );
    if (!response) return;

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ spans: [] });
  });

  it("wraps a returned value in the canonical success envelope", async () => {
    const app = express();
    app.use(express.json());
    app.post(
      "/wrapped",
      handle({ auth: "anonymous" }, () => ({ value: 7 })),
    );

    const response = await runSupertestOrSkip(() =>
      request(app).post("/wrapped").send({}),
    );
    if (!response) return;

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: { value: 7 } });
  });

  it("forwards a rejection to the error middleware", async () => {
    const app = express();
    app.use(express.json());
    app.post(
      "/boom",
      handle({ auth: "anonymous" }, () => {
        throw new Error("handler exploded");
      }),
    );
    app.use(
      (
        error: Error,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        res.status(500).json({ caught: error.message });
      },
    );

    const response = await runSupertestOrSkip(() =>
      request(app).post("/boom").send({}),
    );
    if (!response) return;

    expect(response.body).toEqual({ caught: "handler exploded" });
  });
});

describe("intake — requireBody returns the parsed value", () => {
  it("applies defaults and strips unknown keys", () => {
    const req = {
      path: "/t",
      body: { keep: "yes", drop: "no" },
    } as express.Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as express.Response;

    const outcome = requireBody(
      z.object({ keep: z.string(), added: z.number().default(4) }),
      req,
      res,
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toEqual({ keep: "yes", added: 4 });
    }
  });
});
