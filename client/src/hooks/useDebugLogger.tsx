/**
 * useDebugLogger - React Hook for Component Debugging
 *
 * Provides automatic logging of:
 * - Component mount/unmount
 * - Props changes
 * - State changes
 * - Effect triggers
 * - Render counts
 *
 * Usage:
 *   const debug = useDebugLogger('MyComponent');
 *   debug.logState('formData', formData);
 *   debug.logEffect('fetchData triggered');
 */

import { useEffect, useRef, useCallback, useMemo } from "react";
import { logger } from "../services/LoggingService";

interface DebugLogger {
  logState: (name: string, value: unknown) => void;
  logEffect: (
    description: string,
    deps?: unknown[] | Record<string, unknown>,
  ) => void;
  logAction: (action: string, payload?: unknown) => void;
  logError: (message: string, error?: Error) => void;
  startTimer: (operationId: string) => void;
  endTimer: (operationId: string, description?: string) => void;
}

interface UseDebugLoggerOptions {
  logProps?: boolean;
  logRenders?: boolean;
  logMountUnmount?: boolean;
}

const defaultOptions: UseDebugLoggerOptions = {
  logProps: true,
  logRenders: true,
  logMountUnmount: true,
};

/**
 * Debug logging hook for React components
 */
export function useDebugLogger(
  componentName: string,
  componentProps?: Record<string, unknown>,
  options: UseDebugLoggerOptions = defaultOptions,
): DebugLogger {
  const renderCount = useRef(0);
  const prevPropsRef = useRef<Record<string, unknown> | undefined>(undefined);
  const log = useMemo(() => logger.child(componentName), [componentName]);

  // Track render count
  renderCount.current += 1;

  // Log renders
  if (options.logRenders) {
    log.debug("Render", { renderCount: renderCount.current });
  }

  // Log props changes
  useEffect(() => {
    if (!options.logProps || !componentProps) return;

    if (prevPropsRef.current) {
      const changes = findChangedProps(prevPropsRef.current, componentProps);
      if (changes.length > 0) {
        log.debug("Props changed", {
          changes,
          renderCount: renderCount.current,
        });
      }
    }
    prevPropsRef.current = { ...componentProps };
  }, [componentProps, log, options.logProps]);

  // Log mount/unmount
  useEffect(() => {
    if (!options.logMountUnmount) return;

    log.info("Mounted", { renderCount: 1 });

    return () => {
      log.info("Unmounting", { totalRenders: renderCount.current });
    };
  }, [log, options.logMountUnmount]);

  // Memoized logging functions
  const logState = useCallback(
    (name: string, value: unknown) => {
      log.debug("State change", { name, value: summarize(value) });
    },
    [log],
  );

  const logEffect = useCallback(
    (description: string, deps?: unknown[] | Record<string, unknown>) => {
      if (!deps) {
        log.debug("Effect triggered", { description });
      } else if (Array.isArray(deps)) {
        log.debug("Effect triggered", {
          description,
          deps: deps.map(summarize),
        });
      } else {
        log.debug("Effect triggered", { description, deps });
      }
    },
    [log],
  );

  const logAction = useCallback(
    (action: string, payload?: unknown) => {
      log.info(
        "Action dispatched",
        payload ? { action, payload: summarize(payload) } : { action },
      );
    },
    [log],
  );

  const logError = useCallback(
    (message: string, error?: Error) => {
      log.error(message, error);
    },
    [log],
  );

  const startTimer = useCallback(
    (operationId: string) => {
      logger.startTimer(`${componentName}:${operationId}`);
    },
    [componentName],
  );

  const endTimer = useCallback(
    (operationId: string, description?: string) => {
      const duration = logger.endTimer(`${componentName}:${operationId}`);
      if (duration !== undefined) {
        const meta: Record<string, unknown> = {
          operationId,
          duration: `${duration}ms`,
        };
        if (description) {
          meta.description = description;
        }
        log.debug("Operation completed", meta);
      }
    },
    [componentName, log],
  );

  // Memoize the returned object so consumers can include `debug` in
  // useEffect deps without re-triggering on every render. Each inner
  // callback is already useCallback'd; this just stabilizes the wrapper.
  return useMemo(
    () => ({
      logState,
      logEffect,
      logAction,
      logError,
      startTimer,
      endTimer,
    }),
    [logState, logEffect, logAction, logError, startTimer, endTimer],
  );
}

/**
 * Find which props changed between renders
 */
function findChangedProps(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): Array<{ key: string; prev: unknown; next: unknown }> {
  const changes: Array<{ key: string; prev: unknown; next: unknown }> = [];
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);

  for (const key of allKeys) {
    if (!Object.is(prev[key], next[key])) {
      changes.push({
        key,
        prev: summarize(prev[key]),
        next: summarize(next[key]),
      });
    }
  }

  return changes;
}

/**
 * Summarize values for logging (avoid huge objects in console)
 */
function summarize(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === "function") {
    return `[Function: ${value.name || "anonymous"}]`;
  }

  if (typeof value === "string" && value.length > 100) {
    return `${value.slice(0, 100)}... (${value.length} chars)`;
  }

  if (Array.isArray(value)) {
    return `[Array(${value.length})]`;
  }

  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length > 5) {
      return `{${keys.slice(0, 5).join(", ")}, ... +${keys.length - 5}}`;
    }
    return `{${keys.join(", ")}}`;
  }

  return value;
}

export default useDebugLogger;
