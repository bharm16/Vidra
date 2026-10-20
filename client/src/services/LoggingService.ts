/**
 * Client-Side Logging Service
 *
 * A thin console wrapper with level filtering. Logging is on in development
 * or with VITE_DEBUG_LOGGING=true; VITE_LOG_LEVEL sets the lowest level
 * written (default: debug in development, warn otherwise). Console output
 * stays in the browser, so nothing is redacted here.
 *
 * Usage:
 *   import { logger } from '@/services/LoggingService';
 *   const log = logger.child('Button');
 *   log.info('User action', { action: 'click' });
 */

type LogLevel = "debug" | "info" | "warn" | "error";
type LogMeta = Record<string, unknown>;

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

interface LoggerConfig {
  enabled: boolean;
  level: LogLevel;
}

function readConfig(): LoggerConfig {
  const isDev = import.meta.env?.MODE === "development";
  return {
    enabled: isDev || import.meta.env?.VITE_DEBUG_LOGGING === "true",
    level:
      (import.meta.env?.VITE_LOG_LEVEL as LogLevel) ||
      (isDev ? "debug" : "warn"),
  };
}

class Logger {
  constructor(
    private readonly config: LoggerConfig,
    private readonly context?: string,
  ) {}

  /**
   * Create a logger that prefixes every message with its context
   */
  child(context: string): Logger {
    return new Logger(this.config, context);
  }

  debug(message: string, meta?: LogMeta): void {
    this.write("debug", message, meta);
  }

  info(message: string, meta?: LogMeta): void {
    this.write("info", message, meta);
  }

  warn(message: string, meta?: LogMeta): void {
    this.write("warn", message, meta);
  }

  error(message: string, error?: Error, meta?: LogMeta): void {
    const errorMeta = error
      ? {
          errorName: error.name,
          errorMessage: error.message,
          stack: error.stack,
          ...meta,
        }
      : meta;
    this.write("error", message, errorMeta);
  }

  private write(level: LogLevel, message: string, meta?: LogMeta): void {
    if (!this.config.enabled) return;
    if (LOG_LEVELS[level] < LOG_LEVELS[this.config.level]) return;

    const text = this.context ? `[${this.context}] ${message}` : message;
    const consoleMethod = level === "debug" ? "log" : level;

    if (meta && Object.keys(meta).length > 0) {
      console[consoleMethod](text, meta);
    } else {
      console[consoleMethod](text);
    }
  }
}

// Singleton export
export const logger = new Logger(readConfig());
