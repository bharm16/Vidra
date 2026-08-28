import type { NextFunction, Request, Response } from "express";
import { logger } from "@infrastructure/Logger";
import { isApiKeyUid } from "@utils/apiKeyUser";

const DEFAULT_STARTER_CREDITS = 25;
const STARTER_CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, number>();

type StarterCreditsRequest = Request & {
  user?: {
    uid?: string;
  };
};

const parseStarterCredits = (): number => {
  const raw = Number.parseInt(process.env.FREE_TIER_STARTER_CREDITS ?? "", 10);
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_STARTER_CREDITS;
  }
  return Math.trunc(raw);
};

const shouldSkipUser = (userId: string): boolean => isApiKeyUid(userId);

export function __resetStarterCreditsCacheForTests(): void {
  cache.clear();
}

export function createStarterCreditsMiddleware(userCreditService: {
  ensureStarterGrant: (
    userId: string,
    starterCredits: number,
  ) => Promise<unknown>;
}) {
  return async function starterCreditsMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const authReq = req as StarterCreditsRequest;
    const userId = authReq.user?.uid;

    if (!userId || shouldSkipUser(userId)) {
      next();
      return;
    }

    const now = Date.now();
    const cachedUntil = cache.get(userId);
    if (cachedUntil && cachedUntil > now) {
      next();
      return;
    }

    try {
      await userCreditService.ensureStarterGrant(userId, parseStarterCredits());
    } catch (error) {
      logger.warn("Starter credit bootstrap failed; continuing request", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      cache.set(userId, now + STARTER_CACHE_TTL_MS);
    }

    next();
  };
}
