import pino from "pino";
import pinoPretty from "pino-pretty";
import type { Request, Response, NextFunction } from "express";
import type { ILogger } from "@interfaces/ILogger";
import { getRequestContext } from "./requestContext";

interface LoggerConfig {
  level?: string;
}

/**
 * Structured logging service using Pino
 * Provides consistent logging with contextual metadata
 */
export class Logger implements ILogger {
  private logger: pino.Logger;

  constructor(config: LoggerConfig = {}) {
    // Keep test output quiet by default; development stays verbose.
    const defaultLevel =
      process.env.NODE_ENV === "production"
        ? "info"
        : process.env.NODE_ENV === "test"
          ? "warn"
          : "debug";

    if (process.env.NODE_ENV !== "production") {
      const prettyStream = pinoPretty({
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      });
      this.logger = pino(
        {
          level: config.level || process.env.LOG_LEVEL || defaultLevel,
        },
        prettyStream,
      );
    } else {
      this.logger = pino({
        level: config.level || process.env.LOG_LEVEL || defaultLevel,
      });
    }
  }

  info(message: string, meta: Record<string, unknown> = {}): void {
    if (!this.logger.isLevelEnabled("info")) return;
    this.logger.info(this.enrichMeta(meta), message);
  }

  error(
    message: string,
    error?: Error,
    meta: Record<string, unknown> = {},
  ): void {
    if (!this.logger.isLevelEnabled("error")) return;
    const errorMeta = error
      ? {
          err: {
            errorMessage: error.message,
            stack: error.stack,
            errorName: error.name,
            ...error,
          },
        }
      : {};
    this.logger.error(
      { ...this.enrichMeta(meta), ...errorMeta },
      message,
    );
  }

  warn(message: string, meta: Record<string, unknown> = {}): void {
    if (!this.logger.isLevelEnabled("warn")) return;
    this.logger.warn(this.enrichMeta(meta), message);
  }

  debug(message: string, meta: Record<string, unknown> = {}): void {
    if (!this.logger.isLevelEnabled("debug")) return;
    this.logger.debug(this.enrichMeta(meta), message);
  }

  /**
   * Express middleware for request logging
   */
  requestLogger(): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction): void => {
      const startTime = Date.now();

      // Log on response finish
      res.on("finish", () => {
        const duration = Date.now() - startTime;
        const logData: Record<string, unknown> = {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          requestId: (req as Request & { id?: string }).id,
          userAgent: req.get("user-agent"),
          ip: req.ip,
        };

        if (res.statusCode >= 500) {
          this.error("HTTP Request Error", undefined, logData);
        } else if (res.statusCode >= 400) {
          this.warn("HTTP Request Warning", logData);
        } else {
          this.debug("HTTP Request", logData);
        }
      });

      next();
    };
  }

  /**
   * Child logger with additional context
   */
  child(bindings: Record<string, unknown>): ILogger {
    const childLogger = Object.create(this) as Logger;
    childLogger.logger = this.logger.child(bindings);
    return childLogger;
  }

  private enrichMeta(meta: Record<string, unknown>): Record<string, unknown> {
    const enriched = { ...meta };
    const context = getRequestContext();
    if (context?.requestId && enriched.requestId === undefined) {
      enriched.requestId = context.requestId;
    }
    return enriched;
  }
}

// Export singleton instance
export const logger = new Logger();
