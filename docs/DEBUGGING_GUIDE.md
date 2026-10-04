# Debugging Guide

## Quick Start

```bash
# Enable debug mode (sets LOG_LEVEL=debug in .env)
chmod +x scripts/enable-debug.sh
./scripts/enable-debug.sh

# Start the app
npm run dev

# When done debugging
./scripts/disable-debug.sh
```

---

## Backend Logging (Pino)

### Log Levels

- `error` - Something failed
- `warn` - Potential issue
- `info` - Important events (default in production)
- `debug` - Detailed debugging info

### Viewing Logs

Backend logs appear in your terminal with color-coded output (via pino-pretty).

### Adding Logs to Services

```typescript
import { logger } from "@infrastructure/Logger";

// Simple log
logger.debug("Processing request", { userId: "123" });

// With error
logger.error("Failed to process", error, { context: "enhancement" });

// Child logger with context
const serviceLogger = logger.child({ service: "EnhancementService" });
serviceLogger.info("Generating suggestions");
```

### Filter Logs by Service

```bash
# Pipe to grep for specific service
npm run dev 2>&1 | grep "EnhancementService"
```

---

## Frontend Logging

### Console Logs

All API requests are automatically logged in development mode.

### Using the Logger Service

```typescript
import { logger } from "@/services/LoggingService";

// Basic logging
logger.debug("Component rendered");
logger.info("User action", { action: "click", target: "button" });
logger.warn("Potential issue", { detail: "slow response" });
logger.error("Failed", new Error("Network error"));

// With trace ID for request tracking
const traceId = logger.generateTraceId();
logger.setTraceId(traceId);
logger.info("Starting operation");
// ... operation ...
logger.clearTraceId();

// Timing operations
logger.startTimer("fetchData");
// ... async operation ...
logger.endTimer("fetchData"); // Logs duration
```

### Stack Traces and Callers

Attach call stacks (and a short caller line) to log entries for file/function visibility:

```bash
# Frontend
VITE_LOG_STACK=true

# Backend
LOG_STACK=true
```

Defaults:

- `logStack` only on `warn`/`error`
- `caller` on all logs when stack capture is enabled

Optional tuning:

```bash
# Include stacks for debug/info too
VITE_LOG_STACK_LEVELS=debug,info,warn,error
LOG_STACK_LEVELS=debug,info,warn,error

# Limit stack depth
VITE_LOG_STACK_DEPTH=4
LOG_STACK_DEPTH=4

# Increase stack trace limit (default is low)
VITE_LOG_STACK_LIMIT=50
LOG_STACK_LIMIT=50

# Disable caller if you only want full stacks
VITE_LOG_CALLER=false
LOG_CALLER=false
```

### React Component Debugging

```typescript
import { useDebugLogger } from '@/hooks/useDebugLogger';

function MyComponent(props) {
  const debug = useDebugLogger('MyComponent', props);

  // Log state changes
  debug.logState('formData', formData);

  // Log effects
  debug.logEffect('useEffect triggered', [dependency]);

  // Log user actions
  debug.logAction('submit', { formData });

  // Time async operations
  debug.startTimer('apiCall');
  await fetchData();
  debug.endTimer('apiCall', 'Data fetched');

  return <div>...</div>;
}
```

### Browser Console Commands

```javascript
// Get the logger instance
window.__logger;

// View all stored logs
window.__logger.getStoredLogs();

// Export logs as JSON (for bug reports)
window.__logger.exportLogs();

// Clear stored logs
window.__logger.clearStoredLogs();

// Enable/disable logging
// (Must restart app for changes to take effect)
```

---

## Tracing Request Flow

### Full Stack Trace

1. **Browser Console**: Shows outgoing request with trace ID
2. **Server Terminal**: Shows incoming request with request ID
3. **Service Logs**: Show processing steps
4. **Server Terminal**: Shows response sent
5. **Browser Console**: Shows response received with duration

### Correlating Logs

The `X-Request-Id` header is added to all responses. Match this with:

- Frontend trace ID in console
- Backend request ID in logs

---

## Common Debugging Scenarios

### "API call not working"

1. Check browser Network tab - is request sent?
2. Check browser Console - any errors?
3. Check server terminal - did request arrive?
4. Look for the request ID in server logs

### "Suggestions not appearing"

1. Enable debug logging: `./scripts/enable-debug.sh`
2. Look for `EnhancementService` logs
3. Check for validation failures
4. Verify API response in Network tab

### "Performance issues"

1. Check timing logs in console (auto-logged for API calls)
2. Look for slow operations (> 1000ms)
3. Check if caching is working (look for cache hits/misses)

### "State not updating"

1. Use `useDebugLogger` in component
2. Check for prop/state change logs
3. Verify reducer actions are dispatched

---

## Log Output Examples

### Backend (Pino)

```
[10:30:45.123] INFO: HTTP Request
    method: "POST"
    path: "/api/enhance"
    statusCode: 200
    duration: 342
    requestId: "req-abc123"
```

### Frontend (Console)

```
[trace-xyz] [ApiClient] → POST /api/enhance
  { url: "http://localhost:3001/api/enhance", body: {...} }

[trace-xyz] [ApiClient] ← 200 /api/enhance
  { duration: "342ms", response: {...} }
```

---

## Production Debugging

In production, logs are JSON-formatted (no pino-pretty). Use these tools:

```bash
# View recent logs
cat server.log | tail -50

# Filter by level
cat server.log | jq 'select(.level == 50)' # errors only

# Filter by time range
cat server.log | jq 'select(.time > 1234567890000)'

# Search for specific request
cat server.log | jq 'select(.requestId == "req-abc123")'
```

---

## Sentry Integration

Errors are automatically sent to Sentry if configured. Each error includes:

- Request ID
- User context
- Stack trace
- Environment info

Check Sentry dashboard for:

- Error trends
- Performance issues
- User impact

---

## Tips

1. **Start narrow**: Don't enable debug for everything at once
2. **Use trace IDs**: They help correlate frontend and backend logs
3. **Check Network tab first**: Many issues are visible there
4. **Clear logs regularly**: `window.__logger.clearStoredLogs()`
5. **Export for bug reports**: `window.__logger.exportLogs()` gives you shareable JSON
