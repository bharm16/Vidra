/**
 * Express Request Type Augmentation
 *
 * Extends the Express Request interface with custom properties
 * added by middleware (requestId and performanceMonitor).
 */
import "express";
// The performance-monitor shapes are owned by the middleware that attaches
// them; imported here so the Request augmentation cannot drift from the impl.
import type { RequestPerfMonitor } from "../middleware/performanceMonitor";

declare global {
  namespace Express {
    interface Request {
      /**
       * Unique request identifier
       * Set by requestId middleware from X-Request-ID header or generated UUID
       */
      id: string;

      /**
       * Performance monitoring context
       * Set by PerformanceMonitor middleware for tracking request timing
       */
      perfMonitor?: RequestPerfMonitor;
    }
  }
}

export {};
