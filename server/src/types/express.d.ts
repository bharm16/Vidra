/**
 * Express Request Type Augmentation
 *
 * Extends the Express Request interface with the requestId added by middleware.
 */
import "express";

declare global {
  namespace Express {
    interface Request {
      /**
       * Unique request identifier
       * Set by requestId middleware from X-Request-ID header or generated UUID
       */
      id: string;
    }
  }
}

export {};
