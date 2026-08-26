# Logging Patterns Guide

## Overview

This document defines the logging standards for the Prompt Builder codebase. Proper logging enables debugging, monitoring, and tracing across the full stack. Inconsistent or missing logs make debugging impossible.

---

## ⚠️ STOP - READ THIS FIRST

> **The #1 logging bug in this codebase:**
>
> ```typescript
> // ❌ WRONG - warn() does NOT take an Error argument
> log.warn("Something failed", error, { context });
>
> // ✅ CORRECT - Only error() takes an Error argument
> log.error("Something failed", error, { context });
>
> // ✅ CORRECT - For warn(), put error info in meta
> log.warn("Something failed", { error: error.message, context });
> ```
>
> **Only `error()` accepts an Error object as the 2nd parameter.**  
> All other methods (`debug`, `info`, `warn`) take only `(message, meta)`.
>
> See [Section 2: Method Signatures](#2-method-signatures-critical) for details.

---

## Why Structured Logging?

```typescript
// ❌ USELESS - No context, no structure
console.log("error");
console.log(data);
console.log("done");

// ❌ UNSTRUCTURED - Hard to parse, grep, or alert on
console.log(`User ${userId} failed to process prompt at ${new Date()}`);

// ✅ STRUCTURED - Queryable, filterable, actionable
logger.error("Prompt processing failed", error, {
  userId,
  promptLength: prompt.length,
  service: "EnhancementService",
  operation: "generateSuggestions",
});
```

Structured logs enable:

- **Filtering** by severity, service, operation
- **Alerting** on error rates
- **Tracing** requests across services
- **Debugging** production issues without code changes

---

## 1. Logger Imports

### Backend (Server)

```typescript
// ✅ CORRECT - Use the singleton logger
import { logger } from "@infrastructure/Logger";

// ✅ CORRECT - Create child logger with context
const log = logger.child({ service: "EnhancementService" });

// ❌ FORBIDDEN - Never use console directly
console.log("debug info");
console.error("something failed");
```

### Frontend (Client)

```typescript
// ✅ CORRECT - Use the logging service
import { logger } from "@/services/LoggingService";

// ✅ CORRECT - Create contextual logger
const log = logger.child("ComponentName");

// ❌ FORBIDDEN - Avoid raw console in production code
console.log("debugging");
```

---

## 2. Method Signatures (CRITICAL)

### ⚠️ READ THIS CAREFULLY - Common Source of Bugs

The logging methods have **different signatures**. **Only `error()` accepts an Error object as a parameter.** Using the wrong signature will cause TypeScript errors or silent failures.

### Method Signature Reference

```
┌──────────┬─────────────────────────────────────────────────────────────┬───────────────┐
│  METHOD  │  SIGNATURE                                                  │  ERROR ARG?   │
├──────────┼─────────────────────────────────────────────────────────────┼───────────────┤
│  debug() │  (message: string, meta?: Record<string, unknown>)          │  ❌ NO        │
│  info()  │  (message: string, meta?: Record<string, unknown>)          │  ❌ NO        │
│  warn()  │  (message: string, meta?: Record<string, unknown>)          │  ❌ NO        │
│  error() │  (message: string, error?: Error, meta?: Record<...>)       │  ✅ YES       │
└──────────┴─────────────────────────────────────────────────────────────┴───────────────┘
```

| Method    | Arguments                  | Can pass Error object? |
| --------- | -------------------------- | ---------------------- |
| `debug()` | `(message, meta?)`         | ❌ **NO**              |
| `info()`  | `(message, meta?)`         | ❌ **NO**              |
| `warn()`  | `(message, meta?)`         | ❌ **NO**              |
| `error()` | `(message, error?, meta?)` | ✅ **YES**             |

### ✅ Correct Usage

```typescript
// debug - 2 args max: (message, meta)
log.debug("Processing request", { userId, requestId });

// info - 2 args max: (message, meta)
log.info("Operation completed", { duration: 123, count: 5 });

// warn - 2 args max: (message, meta)  ⚠️ NO ERROR ARGUMENT
log.warn("Falling back to default", { reason: "timeout", retryCount: 3 });

// error - 3 args max: (message, error, meta) ← ONLY error() takes Error object
log.error("Operation failed", error, { userId, operation: "process" });
log.error("Operation failed", new Error("Something broke"), {
  context: "test",
});
```

### ❌ WRONG - These Are Bugs

```typescript
// ❌ WRONG - warn() does NOT accept Error as 2nd argument
log.warn("Connection failed", error, { retryCount: 3 });
//                            ^^^^^ BUG: warn() signature is (message, meta)

// ❌ WRONG - info() does NOT accept Error as 2nd argument
log.info("Retrying operation", error, { attempt: 2 });
//                             ^^^^^ BUG: info() signature is (message, meta)

// ❌ WRONG - debug() does NOT accept Error as 2nd argument
log.debug("Caught exception", error, { context: "handler" });
//                            ^^^^^ BUG: debug() signature is (message, meta)

// ❌ WRONG - Passing error as 3rd argument to non-error methods
log.warn("Failed", { context: "test" }, error);
//                                      ^^^^^ BUG: warn() only takes 2 args
```

### ✅ How to Fix: Include Error Info in Meta Object

When you need to log error details but it's NOT an `error()` level log, put the error information inside the meta object:

```typescript
// ✅ CORRECT - Put error details in the meta object
log.warn("Connection failed, retrying", {
  error: error.message, // Just the message string
  errorName: error.name, // Error type (e.g., "TypeError")
  retryCount: 3,
});

// ✅ CORRECT - For more detail, include stack in meta
log.warn("Recoverable error occurred", {
  error: error.message,
  stack: error.stack, // Include stack trace if needed for debugging
  context: "database connection",
});

// ✅ CORRECT - If it's actually a failure, use error()
log.error("Connection failed", error, { retryCount: 3 });
```

### When to Use Each Level

| Situation                                 | Method    | Example                                           |
| ----------------------------------------- | --------- | ------------------------------------------------- |
| Operation **failed**, needs investigation | `error()` | `log.error('Payment failed', error, { orderId })` |
| Something unexpected but **handled**      | `warn()`  | `log.warn('Rate limited', { error: e.message })`  |
| Normal **business event** completed       | `info()`  | `log.info('Order shipped', { orderId })`          |
| **Debugging** details (dev only)          | `debug()` | `log.debug('Cache miss', { key })`                |

### Decision Flowchart

```
Is the operation a FAILURE that needs attention?
├── YES → Use error(message, error, meta)
└── NO → Is it unexpected/degraded behavior?
         ├── YES → Use warn(message, { error: e.message, ...meta })
         └── NO → Is it a significant business event?
                  ├── YES → Use info(message, meta)
                  └── NO → Use debug(message, meta)
```

### Copy-Paste Templates

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// ERROR - Operation failed (3 args: message, Error, meta)
// ═══════════════════════════════════════════════════════════════════════════
log.error("Description of failure", error, {
  operation: "methodName",
  userId,
  // ... additional context
});

// ═══════════════════════════════════════════════════════════════════════════
// WARN - Handled gracefully (2 args: message, meta)
// ⚠️ NOTE: Error info goes INSIDE meta object, NOT as 2nd argument!
// ═══════════════════════════════════════════════════════════════════════════
log.warn("Description of issue", {
  error: error.message, // ← Error message as string property
  errorName: error.name, // ← Optional: error type
  operation: "methodName",
  // ... additional context
});

// ═══════════════════════════════════════════════════════════════════════════
// INFO - Business events (2 args: message, meta)
// ═══════════════════════════════════════════════════════════════════════════
log.info("Description of event", {
  operation: "methodName",
  duration: 123,
  // ... additional context
});

// ═══════════════════════════════════════════════════════════════════════════
// DEBUG - Troubleshooting (2 args: message, meta)
// ═══════════════════════════════════════════════════════════════════════════
log.debug("Description of state", {
  operation: "methodName",
  // ... debugging details
});
```

---

## 3. Log Levels

### Level Definitions

| Level   | When to Use                        | Production Visibility |
| ------- | ---------------------------------- | --------------------- |
| `error` | Operation failed, needs attention  | ✅ Always visible     |
| `warn`  | Potential issue, degraded behavior | ✅ Always visible     |
| `info`  | Significant business events        | ✅ Always visible     |
| `debug` | Detailed debugging information     | ❌ Dev only           |

### Choosing the Right Level

```typescript
// ERROR - Something broke, needs investigation (CAN pass error object)
logger.error("Failed to generate suggestions", error, {
  userId,
  promptId,
});

// WARN - Something unexpected but handled (CANNOT pass error object)
// ⚠️ Put error info in meta object!
logger.warn("Falling back to default model", {
  error: rateLimitError.message, // ← error info goes HERE
  requestedModel: "gpt-4",
  fallbackModel: "gpt-3.5-turbo",
});

// INFO - Significant business event
logger.info("Prompt optimization completed", {
  userId,
  duration: 1234,
  suggestionCount: 5,
});

// DEBUG - Development/troubleshooting details
logger.debug("Processing request", {
  payload: summarize(payload),
  headers: sanitize(headers),
});
```

### What NOT to Log at Each Level

```typescript
// ❌ ERROR for expected conditions
logger.error("User not found"); // Use warn or just return 404

// ❌ INFO for debugging details
logger.info("Entering function processData", { args }); // Use debug

// ❌ DEBUG for sensitive data
logger.debug("User credentials", { password }); // NEVER log secrets

// ❌ Logging loop iterations
for (const item of items) {
  logger.info("Processing item", { item }); // Will spam logs
}

// ✅ Log aggregated results instead
logger.info("Batch processing complete", {
  total: items.length,
  successful: successCount,
  failed: failCount,
});
```

---

## 4. Structured Metadata

### Rule: Always Include Context

```typescript
// ❌ BAD - No context
logger.error("Request failed");

// ❌ BAD - Message contains data (hard to parse)
logger.error(`Request ${requestId} failed for user ${userId}`);

// ✅ GOOD - Structured metadata
logger.error("Request failed", error, {
  requestId,
  userId,
  endpoint: "/api/enhance",
  duration: 1234,
});
```

### Standard Metadata Fields

| Field       | Type   | When to Include                        |
| ----------- | ------ | -------------------------------------- |
| `service`   | string | Always (via child logger)              |
| `operation` | string | Always                                 |
| `userId`    | string | When user context exists               |
| `requestId` | string | For HTTP requests                      |
| `traceId`   | string | For distributed tracing                |
| `duration`  | number | For timed operations                   |
| `error`     | string | When logging errors in warn/info/debug |

### Metadata Best Practices

```typescript
// ✅ Create child logger with service context
class EnhancementService {
  private readonly log = logger.child({ service: "EnhancementService" });

  async generateSuggestions(params: Params): Promise<Result> {
    const startTime = Date.now();

    this.log.debug("Starting suggestion generation", {
      operation: "generateSuggestions",
      promptLength: params.prompt.length,
      category: params.category,
    });

    try {
      const result = await this.process(params);

      this.log.info("Suggestions generated", {
        operation: "generateSuggestions",
        duration: Date.now() - startTime,
        suggestionCount: result.suggestions.length,
      });

      return result;
    } catch (error) {
      // ✅ error() CAN take Error object as 2nd argument
      this.log.error("Suggestion generation failed", error as Error, {
        operation: "generateSuggestions",
        duration: Date.now() - startTime,
        params: summarize(params),
      });
      throw error;
    }
  }
}
```

---

## 5. Error Logging

### Rule: Always Include Stack Traces

```typescript
// ❌ BAD - Lost stack trace
try {
  await riskyOperation();
} catch (error) {
  logger.error("Operation failed"); // What error? Where?
}

// ❌ BAD - Only message, no stack
try {
  await riskyOperation();
} catch (error) {
  logger.error(`Operation failed: ${(error as Error).message}`);
}

// ✅ GOOD - Full error with stack trace
try {
  await riskyOperation();
} catch (error) {
  logger.error("Operation failed", error as Error, {
    operation: "riskyOperation",
    context: "processing batch",
  });
}
```

### Error Context Pattern

```typescript
// ✅ Add context at each level of the call stack
async function processRequest(req: Request): Promise<Response> {
  try {
    return await handleRequest(req);
  } catch (error) {
    logger.error("Request processing failed", error as Error, {
      requestId: req.id,
      path: req.path,
      method: req.method,
    });
    throw error; // Re-throw for error handler
  }
}

async function handleRequest(req: Request): Promise<Response> {
  try {
    return await enhancementService.process(req.body);
  } catch (error) {
    // Add service-level context, then re-throw
    logger.error("Enhancement service error", error as Error, {
      service: "EnhancementService",
      inputLength: req.body.prompt?.length,
    });
    throw error;
  }
}
```

### Catching and Warning (NOT error level)

When you catch an error but handle it gracefully, use `warn()` with error info in meta:

```typescript
async function fetchWithFallback(url: string): Promise<Data> {
  try {
    return await primaryFetch(url);
  } catch (error) {
    // ⚠️ This is warn(), so error info goes in META object
    logger.warn("Primary fetch failed, using fallback", {
      error: (error as Error).message, // ← String, not Error object
      errorName: (error as Error).name,
      url,
    });
    return await fallbackFetch(url);
  }
}
```

---

## 6. Sensitive Data

### Rule: Never Log Secrets or PII

```typescript
// ❌ FORBIDDEN - Logging secrets
logger.debug("API call", {
  apiKey: process.env.API_KEY, // NEVER
  password: user.password, // NEVER
  creditCard: payment.cardNumber, // NEVER
});

// ❌ FORBIDDEN - Logging PII without redaction
logger.info("User registered", {
  email: user.email, // PII
  ssn: user.ssn, // PII
  phone: user.phone, // PII
});

// ✅ CORRECT - Redact sensitive data
logger.info("User registered", {
  userId: user.id,
  emailDomain: user.email.split("@")[1], // Only domain
  hasPhone: !!user.phone, // Boolean only
});
```

### Built-in Sanitization Utilities

The codebase provides sanitization utilities to help prevent accidental exposure of sensitive data:

```typescript
// Backend
import {
  sanitizeHeaders,
  summarize,
  redactSensitiveFields,
  sanitizeUserData,
  getEmailDomain,
} from "@utils/logging";

// Frontend (includes additional sanitizeError utility)
import {
  sanitizeHeaders,
  summarize,
  redactSensitiveFields,
  sanitizeUserData,
  getEmailDomain,
  sanitizeError,
} from "@/utils/logging";
```

### Sanitize Headers

Use `sanitizeHeaders()` to redact sensitive HTTP headers:

```typescript
import { sanitizeHeaders } from "@utils/logging";

logger.debug("Request received", {
  headers: sanitizeHeaders(req.headers),
  // Automatically redacts: authorization, x-api-key, cookie, etc.
});
```

### Summarize Large Payloads

Use `summarize()` to prevent logging massive data structures:

```typescript
import { summarize } from "@utils/logging";

logger.debug("Processing payload", {
  payload: summarize(largePayload), // Truncates strings, samples arrays/objects
});

// String: "abc..." (500 chars)
// Array: { type: 'array', length: 100, sample: [1, 2, 3] }
// Object: { type: 'object', keys: ['a', 'b', ...], keyCount: 50 }
```

### Redact Sensitive Fields

Use `redactSensitiveFields()` to automatically redact sensitive object properties:

```typescript
import { redactSensitiveFields } from "@utils/logging";

const requestData = {
  username: "john",
  password: "secret123",
  apiKey: "key-abc",
  data: { nested: "value" },
};

logger.debug("Request data", {
  data: redactSensitiveFields(requestData),
  // Result: { username: 'john', password: '[REDACTED]', apiKey: '[REDACTED]', data: {...} }
});

// Add custom sensitive fields
logger.debug("Custom data", {
  data: redactSensitiveFields(obj, ["customSecret", "internalId"]),
});
```

### Sanitize User Data

Use `sanitizeUserData()` to log user information safely:

```typescript
import { sanitizeUserData } from "@utils/logging";

logger.info("User action", {
  user: sanitizeUserData(user),
  // Includes: userId, emailDomain, role, status
  // Excludes: email, password, phone, etc.
});
```

### Extract Email Domain

Use `getEmailDomain()` for analytics without exposing full emails:

```typescript
import { getEmailDomain } from "@utils/logging";

logger.info("User signup", {
  emailDomain: getEmailDomain(user.email), // 'example.com' instead of 'user@example.com'
  userId: user.id,
});
```

### Sanitize Error Objects (Frontend Only)

Use `sanitizeError()` to safely log error information in the frontend:

```typescript
import { sanitizeError } from '@/utils/logging';

try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed', error as Error, {
    errorInfo: sanitizeError(error),
    // Preserves: message, name, stack
    // Removes: any potential sensitive data from error messages
  });
}

// Works with unknown error types
catch (error) {
  const errorInfo = sanitizeError(error);
  logger.warn('Unexpected error', {
    error: errorInfo.message,
    errorName: errorInfo.name,
  });
}
```

**Note**: This utility is frontend-only. The backend logger automatically handles Error objects correctly when passed to `error()` method.

### Existing Protection: Error Handler

The error handler middleware automatically redacts sensitive data from request bodies:

```javascript
// server/src/middleware/errorHandler.js
// Automatically redacts:
// - Email addresses
// - SSN patterns
// - Credit card numbers
// - Phone numbers
// - API keys (long alphanumeric strings)
// - Sensitive field names (password, token, apiKey, secret, etc.)
```

This protection is **always active** for all error logs, even in development mode.

### Data Summarization Pattern

```typescript
// ✅ Summarize large payloads
function summarize(data: unknown, maxLength = 200): unknown {
  if (typeof data === "string") {
    return data.length > maxLength
      ? `${data.slice(0, maxLength)}... (${data.length} chars)`
      : data;
  }

  if (Array.isArray(data)) {
    return {
      type: "array",
      length: data.length,
      sample: data.slice(0, 3),
    };
  }

  if (typeof data === "object" && data !== null) {
    return {
      type: "object",
      keys: Object.keys(data).slice(0, 10),
      keyCount: Object.keys(data).length,
    };
  }

  return data;
}

// Usage
logger.debug("Processing payload", {
  payload: summarize(largePayload),
});
```

### Sensitive Data Checklist

**Never log these:**

- ❌ Passwords
- ❌ API keys / tokens
- ❌ Authorization headers (full value)
- ❌ Cookie values
- ❌ Credit card numbers
- ❌ CVV codes
- ❌ SSN / national IDs
- ❌ Full email addresses (use domain only)
- ❌ Phone numbers
- ❌ Physical addresses
- ❌ Biometric data

**Safe to log:**

- ✅ User IDs (non-PII identifiers)
- ✅ Email domains (not full emails)
- ✅ Request IDs / trace IDs
- ✅ Timestamps
- ✅ Counts and aggregates
- ✅ Status codes
- ✅ Durations
- ✅ Boolean flags (hasEmail, isVerified)
- ✅ Sanitized headers
- ✅ Summarized payloads

---

## 7. Performance Logging

### Rule: Log Duration for Async Operations

```typescript
// ✅ Pattern: Measure and log duration
async function optimizePrompt(prompt: string): Promise<string> {
  const startTime = performance.now();
  const operation = "optimizePrompt";

  logger.debug(`Starting ${operation}`, { promptLength: prompt.length });

  try {
    const result = await llmClient.complete(prompt);
    const duration = Math.round(performance.now() - startTime);

    logger.info(`${operation} completed`, {
      operation,
      duration,
      inputLength: prompt.length,
      outputLength: result.length,
    });

    return result;
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);

    // ✅ error() takes Error as 2nd arg
    logger.error(`${operation} failed`, error as Error, {
      operation,
      duration,
      promptLength: prompt.length,
    });

    throw error;
  }
}
```

### Timing Utility

```typescript
// utils/timing.ts
export function withTiming<T>(
  operation: string,
  fn: () => Promise<T>,
  log: ILogger,
): Promise<T> {
  const startTime = performance.now();

  return fn()
    .then((result) => {
      log.info(`${operation} completed`, {
        operation,
        duration: Math.round(performance.now() - startTime),
      });
      return result;
    })
    .catch((error) => {
      // ✅ error() takes Error as 2nd arg
      log.error(`${operation} failed`, error, {
        operation,
        duration: Math.round(performance.now() - startTime),
      });
      throw error;
    });
}

// Usage
const result = await withTiming(
  "generateSuggestions",
  () => this.process(params),
  this.log,
);
```

---

## 8. Frontend Logging

### Component Logging

```typescript
// ❌ BAD - Random console.logs
function PromptPanel() {
  console.log('render');

  useEffect(() => {
    console.log('mounted');
  }, []);

  return <div>...</div>;
}

// ✅ GOOD - Use debug logger hook
import { useDebugLogger } from '@/hooks/useDebugLogger';

function PromptPanel(props: PromptPanelProps) {
  const debug = useDebugLogger('PromptPanel', props);

  useEffect(() => {
    debug.logEffect('mounted');
    debug.startTimer('initialization');

    // ... initialization logic

    debug.endTimer('initialization', 'Component initialized');
  }, []);

  const handleSubmit = async () => {
    debug.logAction('submit', { formData });
    debug.startTimer('submit');

    try {
      await submitForm(formData);
      debug.endTimer('submit', 'Form submitted successfully');
    } catch (error) {
      debug.logError('Form submission failed', error as Error);
    }
  };

  return <div>...</div>;
}
```

### API Call Logging

API calls are automatically logged via interceptors. For custom logging:

```typescript
import { logger } from "@/services/LoggingService";

async function customFetch(
  url: string,
  options: RequestInit,
): Promise<Response> {
  const traceId = logger.generateTraceId();
  logger.setTraceId(traceId);

  logger.debug("Starting custom fetch", { url, method: options.method });

  try {
    const response = await fetch(url, options);

    logger.info("Custom fetch completed", {
      url,
      status: response.status,
    });

    return response;
  } catch (error) {
    // ✅ error() takes Error as 2nd arg
    logger.error("Custom fetch failed", error as Error, { url });
    throw error;
  } finally {
    logger.clearTraceId();
  }
}
```

---

## 9. Request Tracing

### Backend: Request ID

```typescript
// middleware/requestId.ts
import { v4 as uuidv4 } from "uuid";

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId = (req.headers["x-request-id"] as string) || uuidv4();
  req.id = requestId;
  res.setHeader("X-Request-Id", requestId);

  // Create request-scoped logger
  req.log = logger.child({ requestId });

  next();
}

// Usage in route handlers
app.post("/api/enhance", async (req, res) => {
  req.log.info("Enhancement request received", {
    operation: "enhance",
    promptLength: req.body.prompt?.length,
  });

  // ... handler logic
});
```

### Frontend: Trace ID

```typescript
// Automatic via API interceptors, or manual:
import { logger } from "@/services/LoggingService";

async function complexOperation(): Promise<void> {
  const traceId = logger.generateTraceId();
  logger.setTraceId(traceId);

  try {
    logger.info("Starting complex operation");
    await step1();
    logger.debug("Step 1 complete");
    await step2();
    logger.debug("Step 2 complete");
    logger.info("Complex operation complete");
  } finally {
    logger.clearTraceId();
  }
}
```

---

## 10. Configuration

### Backend (`server/.env`)

```bash
# Log level: debug, info, warn, error
LOG_LEVEL=info

# In production, logs are JSON (no pino-pretty)
NODE_ENV=production
```

### Frontend (`client/.env`)

```bash
# Enable client-side logging
VITE_DEBUG_LOGGING=true

# Log level: debug, info, warn, error
VITE_LOG_LEVEL=debug
```

### Enable Debug Mode

```bash
# Quick enable (run from project root)
./scripts/enable-debug.sh

# Quick disable
./scripts/disable-debug.sh
```

---

## 11. Service Logging Template

### Backend Service

```typescript
import { logger } from "@infrastructure/Logger";
import type { ILogger } from "@interfaces/ILogger";

export class FeatureService {
  private readonly log: ILogger;

  constructor() {
    this.log = logger.child({ service: "FeatureService" });
  }

  async process(input: Input): Promise<Output> {
    const startTime = performance.now();
    const operation = "process";

    this.log.debug(`Starting ${operation}`, {
      operation,
      inputSize: JSON.stringify(input).length,
    });

    try {
      // Validate input
      const validated = InputSchema.parse(input);

      // Process
      const result = await this.doWork(validated);

      // Log success
      this.log.info(`${operation} completed`, {
        operation,
        duration: Math.round(performance.now() - startTime),
        resultSize: JSON.stringify(result).length,
      });

      return result;
    } catch (error) {
      // ✅ error() takes Error as 2nd arg
      this.log.error(`${operation} failed`, error as Error, {
        operation,
        duration: Math.round(performance.now() - startTime),
        input: summarize(input),
      });
      throw error;
    }
  }
}
```

### React Hook

```typescript
import { useCallback } from "react";
import { logger } from "@/services/LoggingService";

export function useFeature() {
  const log = logger.child("useFeature");

  const doSomething = useCallback(async (params: Params) => {
    log.debug("doSomething called", { params: summarize(params) });
    logger.startTimer("doSomething");

    try {
      const result = await apiCall(params);
      const duration = logger.endTimer("doSomething");

      log.info("doSomething completed", {
        duration,
        resultCount: result.length,
      });
      return result;
    } catch (error) {
      logger.endTimer("doSomething");
      // ✅ error() takes Error as 2nd arg
      log.error("doSomething failed", error as Error);
      throw error;
    }
  }, []);

  return { doSomething };
}
```

---

## Anti-Patterns

### ❌ #1 Bug: Passing Error to warn/info/debug

This is the most common logging bug in this codebase:

```typescript
// ❌ WRONG - warn() does NOT take Error as 2nd argument
log.warn("Request failed", error, { context: "api" });
//                         ^^^^^ BUG!

// ❌ WRONG - info() does NOT take Error as 2nd argument
log.info("Retrying", error, { attempt: 2 });
//                   ^^^^^ BUG!

// ❌ WRONG - debug() does NOT take Error as 2nd argument
log.debug("Caught", error, { handler: "global" });
//                  ^^^^^ BUG!

// ✅ CORRECT - Put error info in meta object for warn/info/debug
log.warn("Request failed", {
  error: error.message,
  context: "api",
});

// ✅ CORRECT - Only error() takes Error as 2nd argument
log.error("Request failed", error, { context: "api" });
```

### ❌ Console Logging in Production Code

```typescript
// ❌ NEVER - Console statements in production
console.log("debugging");
console.error("error:", error);
console.warn("warning");
console.debug("data:", data);

// ✅ ALWAYS - Use the logger
logger.debug("debugging");
logger.error("Error occurred", error);
logger.warn("Warning condition", { error: error.message });
logger.debug("Data received", { data: summarize(data) });
```

### ❌ Logging Without Context

```typescript
// ❌ BAD - No context
logger.error("Failed");

// ✅ GOOD - Full context
logger.error("Suggestion generation failed", error, {
  service: "EnhancementService",
  operation: "generateSuggestions",
  userId,
  promptLength,
});
```

### ❌ Logging Sensitive Data

```typescript
// ❌ FORBIDDEN
logger.debug("Auth", { token: authToken, password });

// ✅ CORRECT
logger.debug("Auth attempt", {
  userId,
  hasToken: !!authToken,
});
```

### ❌ Excessive Logging in Loops

```typescript
// ❌ BAD - N log statements
for (const item of items) {
  logger.debug("Processing", { item });
}

// ✅ GOOD - Aggregate logging
logger.debug("Starting batch processing", { count: items.length });
const results = items.map(process);
logger.info("Batch processing complete", {
  total: items.length,
  successful: results.filter((r) => r.success).length,
});
```

### ❌ String Concatenation in Messages

```typescript
// ❌ BAD - Hard to parse
logger.info(`User ${userId} created prompt ${promptId} at ${timestamp}`);

// ✅ GOOD - Structured
logger.info("Prompt created", { userId, promptId, timestamp });
```

---

## Quick Reference

### ⚠️ Method Signatures - Memorize This

```typescript
// ONLY error() takes an Error object as 2nd argument
log.debug(message, meta); // 2 args
log.info(message, meta); // 2 args
log.warn(message, meta); // 2 args  ← NO Error arg!
log.error(message, error, meta); // 3 args  ← CAN have Error arg

// When you need error info in warn/info/debug:
log.warn("Something failed", { error: e.message, ...otherMeta });
```

### Import Patterns

```typescript
// Backend
import { logger } from "@infrastructure/Logger";
const log = logger.child({ service: "ServiceName" });

// Frontend
import { logger } from "@/services/LoggingService";
const log = logger.child("ComponentName");
```

### Log Levels Quick Reference

| Level   | Use For  | Signature            | Example                                      |
| ------- | -------- | -------------------- | -------------------------------------------- |
| `error` | Failures | `(msg, err?, meta?)` | `log.error('Failed', error, ctx)`            |
| `warn`  | Degraded | `(msg, meta?)`       | `log.warn('Fallback', { error: e.message })` |
| `info`  | Events   | `(msg, meta?)`       | `log.info('Done', ctx)`                      |
| `debug` | Details  | `(msg, meta?)`       | `log.debug('State', ctx)`                    |

### Standard Context Fields

```typescript
{
  service: 'ServiceName',      // Always (via child logger)
  operation: 'methodName',     // Always
  duration: 1234,              // For timed operations
  requestId: 'req-xxx',        // For HTTP requests
  userId: 'user-xxx',          // When available
  error: 'error message',      // For warn/info/debug with error context
}
```

### Timing Pattern

```typescript
const startTime = performance.now();
try {
  const result = await operation();
  log.info("Operation completed", {
    duration: Math.round(performance.now() - startTime),
  });
  return result;
} catch (error) {
  log.error("Operation failed", error as Error, {
    duration: Math.round(performance.now() - startTime),
  });
  throw error;
}
```

---

## Browser Console Commands

```javascript
// Access logger
window.__logger;

// View stored logs
window.__logger.getStoredLogs();

// Export for bug reports
copy(window.__logger.exportLogs());

// Clear logs
window.__logger.clearStoredLogs();
```

---

## Checklist Before Committing

- [ ] No `console.log/warn/error/debug` statements
- [ ] All `warn()`, `info()`, `debug()` calls have only 2 arguments
- [ ] All `error()` calls pass Error object as 2nd argument (if available)
- [ ] Error info in `warn()`/`info()`/`debug()` is in the meta object
- [ ] No sensitive data (passwords, tokens, PII) in logs
- [ ] Structured metadata instead of string concatenation
- [ ] Child logger created with service/component context
