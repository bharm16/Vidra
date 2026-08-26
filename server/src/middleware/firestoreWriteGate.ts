import type { NextFunction, Request, Response } from "express";
import { logger } from "@infrastructure/Logger";
import type { FirestoreCircuitExecutor } from "@services/firestore/FirestoreCircuitExecutor";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function createFirestoreWriteGateMiddleware(
  firestoreCircuitExecutor: FirestoreCircuitExecutor,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!MUTATING_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }

    if (firestoreCircuitExecutor.isWriteAllowed()) {
      next();
      return;
    }

    const retryAfterSeconds = firestoreCircuitExecutor.getRetryAfterSeconds();
    const requestId = req.id;
    logger.warn("Firestore write gate blocked mutating request", {
      method: req.method,
      path: req.path,
      requestId,
      retryAfterSeconds,
    });

    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(503).json({
      error: "Service temporarily unavailable",
      code: "SERVICE_UNAVAILABLE",
      details:
        "Write operations are temporarily unavailable while datastore recovers.",
      ...(requestId ? { requestId } : {}),
    });
  };
}
