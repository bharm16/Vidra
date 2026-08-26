# Manual Validation Guide - Comprehensive Logging Implementation

## Overview

This guide provides step-by-step instructions for manually validating the comprehensive logging implementation. Follow these procedures to verify that all logging is working correctly across the application.

## Prerequisites

### 1. Environment Setup

**Backend (.env):**

```bash
# Enable debug logging
LOG_LEVEL=debug

# Ensure development mode for pretty printing
NODE_ENV=development
```

**Frontend (client/.env):**

```bash
# Enable client-side logging
VITE_DEBUG_LOGGING=true

# Set log level to debug
VITE_LOG_LEVEL=debug
```

### 2. Start the Application

```bash
# Terminal 1: Start backend
npm run dev

# Terminal 2: Start frontend (in client directory)
cd client
npm run dev
```

## Validation Checklist

### ✅ 1. Backend Service Logging

#### Test: EnhancementService

**Steps:**

1. Make a POST request to `/api/enhance` with a prompt
2. Check backend logs for:
   - ✅ Debug log: "Starting generateSuggestions" with operation and input summary
   - ✅ Info log: "generateSuggestions completed" with duration and result count
   - ✅ Verify duration is in milliseconds (number)
   - ✅ Verify operation field is present
   - ✅ Verify service field is "EnhancementService"

**Expected Log Pattern:**

```json
{
  "level": "debug",
  "service": "EnhancementService",
  "operation": "generateSuggestions",
  "promptLength": 150,
  "message": "Starting generateSuggestions"
}
{
  "level": "info",
  "service": "EnhancementService",
  "operation": "generateSuggestions",
  "duration": 1234,
  "suggestionCount": 5,
  "message": "generateSuggestions completed"
}
```

#### Test: CacheService

**Steps:**

1. Trigger cache operations (get, set, delete)
2. Check backend logs for:
   - ✅ Debug logs for cache operations
   - ✅ Duration tracking for async operations
   - ✅ Cache hit/miss logging

### ✅ 2. API Route Logging

#### Test: Enhancement Route

**Steps:**

1. Make a POST request to `/api/enhance`
2. Check backend logs for:
   - ✅ Info log: "Request received" with requestId, method, path
   - ✅ Info log: "Response sent" with requestId, status, duration
   - ✅ Verify requestId is present and consistent across logs
   - ✅ Verify headers are sanitized (no authorization tokens visible)

**Expected Log Pattern:**

```json
{
  "level": "info",
  "requestId": "req-abc123",
  "method": "POST",
  "path": "/api/enhance",
  "message": "Request received"
}
{
  "level": "info",
  "requestId": "req-abc123",
  "status": 200,
  "duration": 1500,
  "message": "Response sent"
}
```

#### Test: Error Handling

**Steps:**

1. Make a request that will fail (invalid input)
2. Check backend logs for:
   - ✅ Error log with Error object (includes stack trace)
   - ✅ Error log includes requestId
   - ✅ Error log includes operation context
   - ✅ Verify error message is descriptive

### ✅ 3. Frontend Component Logging

#### Test: PromptCanvas

**Steps:**

1. Open the application
2. Enter a prompt and generate suggestions
3. Open browser console (F12)
4. Check for:
   - ✅ Debug log: Component mounted
   - ✅ Info log: "Span labeling completed" with span count
   - ✅ Action log: Copy button click with prompt length
   - ✅ Action log: Export with format and timing

**Browser Console Commands:**

```javascript
// View all stored logs
window.__logger.getStoredLogs();

// Filter logs by component
window.__logger
  .getStoredLogs()
  .filter((log) => log.component === "PromptCanvas");

// Export logs to clipboard
copy(window.__logger.exportLogs());
```

#### Test: SuggestionsPanel

**Steps:**

1. Select text to open suggestions panel
2. Switch between categories
3. Check browser console for:
   - ✅ Effect log: Panel opened with suggestion count
   - ✅ Action log: Category changed with previous and new category
   - ✅ Effect log: Panel closed

#### Test: PromptInput

**Steps:**

1. Change mode in dropdown
2. Submit prompt via button
3. Submit prompt via keyboard (Cmd/Ctrl+Enter)
4. Check browser console for:
   - ✅ Action log: Mode selection
   - ✅ Action log: Optimize via button with mode and length
   - ✅ Action log: Optimize via keyboard with modifier key

### ✅ 4. Frontend Hook Logging

#### Test: usePromptHistory

**Steps:**

1. Save a prompt to history
2. Load history
3. Delete a history entry
4. Clear history
5. Check browser console for:
   - ✅ Debug log: Operation start for each action
   - ✅ Info log: Operation completion with duration
   - ✅ Verify duration is present and reasonable
   - ✅ Verify userId is logged when authenticated

**Expected Pattern:**

```javascript
{
  level: "debug",
  operation: "saveToHistory",
  mode: "enhance",
  hasUser: true,
  inputLength: 150,
  outputLength: 200
}
{
  level: "info",
  operation: "saveToHistory",
  uuid: "abc-123",
  duration: 45
}
```

#### Test: usePromptDebugger

**Steps:**

1. Click on a highlight to fetch suggestions
2. Capture prompt data
3. Check browser console for:
   - ✅ Debug log: "Fetching suggestions for highlight"
   - ✅ Info log: "Suggestions fetched successfully" with count and duration
   - ✅ Debug log: "Starting prompt data capture"
   - ✅ Info log: "Prompt data captured successfully" with duration

#### Test: useHierarchyValidation

**Steps:**

1. Create spans with orphaned attributes
2. Check browser console for:
   - ✅ Warn log: "Hierarchy validation issues detected" with error/warning counts
   - ✅ Debug log: Validation completion with isValid status

### ✅ 5. Error Logging Verification

#### Test: Backend Error Logging

**Steps:**

1. Trigger an error (invalid API request)
2. Check backend logs for:
   - ✅ Error log uses `error()` method (3 arguments)
   - ✅ Error object is passed as 2nd parameter
   - ✅ Stack trace is present
   - ✅ Context metadata is included (requestId, operation, etc.)
   - ✅ Duration is logged even on failure

**Verify Pattern:**

```javascript
// ✅ CORRECT - error() with Error object
logger.error("Operation failed", error, {
  operation: "processRequest",
  requestId: "req-123",
  duration: 500,
});

// ❌ WRONG - would be warn() with error in meta
logger.warn("Operation failed", error, { context });
```

#### Test: Frontend Error Logging

**Steps:**

1. Trigger a frontend error (network failure, invalid input)
2. Check browser console for:
   - ✅ Error log includes Error object
   - ✅ Component/hook context is present
   - ✅ Error message is descriptive
   - ✅ Stack trace is available

### ✅ 6. Sensitive Data Protection

#### Test: Header Sanitization

**Steps:**

1. Make an API request with authorization header
2. Check backend logs for:
   - ✅ Authorization header is `[REDACTED]`
   - ✅ X-API-Key header is `[REDACTED]`
   - ✅ Cookie header is `[REDACTED]`
   - ✅ Other headers are visible

**Verification Command:**

```bash
# Search logs for sensitive data (should find NONE)
grep -r "Bearer " server.log
grep -r "api_key.*:" server.log
grep -r "password.*:" server.log
```

#### Test: User Data Sanitization

**Steps:**

1. Perform user-related operations
2. Check logs for:
   - ✅ Full email addresses are NOT logged
   - ✅ Email domain IS logged (e.g., "example.com")
   - ✅ User ID IS logged
   - ✅ Passwords are NEVER logged
   - ✅ API keys are NEVER logged

#### Test: Payload Summarization

**Steps:**

1. Send a large payload (>200 chars)
2. Check logs for:
   - ✅ Payload is truncated with "... (N chars)"
   - ✅ Arrays show sample and length
   - ✅ Objects show keys and key count

### ✅ 7. Performance Timing

#### Test: Duration Measurements

**Steps:**

1. Perform various operations (API calls, cache operations, etc.)
2. Check logs for:
   - ✅ All async operations log duration
   - ✅ Duration is in milliseconds (integer)
   - ✅ Duration is reasonable (not 0, not negative)
   - ✅ Duration is logged even on failure

**Verification:**

```javascript
// Frontend: Check timing accuracy
const logs = window.__logger.getStoredLogs();
const timedOps = logs.filter((log) => log.duration !== undefined);
console.log("Operations with timing:", timedOps.length);
console.log(
  "Average duration:",
  timedOps.reduce((sum, log) => sum + log.duration, 0) / timedOps.length,
);
```

#### Test: Timer Cleanup

**Steps:**

1. Trigger operations that fail
2. Verify:
   - ✅ endTimer() is called even on error
   - ✅ No timer leaks (check for warnings about missing timers)
   - ✅ Duration is logged in error logs

### ✅ 8. Metadata Consistency

#### Test: Standard Fields

**Steps:**

1. Review logs from various sources
2. Verify all logs include:
   - ✅ `operation` field (method/function name)
   - ✅ `service` or `component` field (via child logger)
   - ✅ `duration` field (for timed operations)
   - ✅ `requestId` field (for HTTP requests)
   - ✅ `userId` field (where user context exists)

**Verification Script:**

```javascript
// Frontend: Check metadata consistency
const logs = window.__logger.getStoredLogs();

// Check operation field
const withOperation = logs.filter((log) => log.operation);
console.log(`Logs with operation: ${withOperation.length}/${logs.length}`);

// Check component field
const withComponent = logs.filter((log) => log.component);
console.log(`Logs with component: ${withComponent.length}/${logs.length}`);

// Check duration field (for info/error logs)
const infoErrorLogs = logs.filter(
  (log) => log.level === "info" || log.level === "error",
);
const withDuration = infoErrorLogs.filter((log) => log.duration !== undefined);
console.log(
  `Info/Error logs with duration: ${withDuration.length}/${infoErrorLogs.length}`,
);
```

### ✅ 9. Console Statement Elimination

#### Test: No Console Statements

**Steps:**

1. Search codebase for console statements
2. Verify:
   - ✅ No `console.log` in production code
   - ✅ No `console.error` in production code
   - ✅ No `console.warn` in production code
   - ✅ No `console.debug` in production code

**Verification Commands:**

```bash
# Search for console statements (should find NONE in src/)
grep -r "console\.log" server/src/ client/src/
grep -r "console\.error" server/src/ client/src/
grep -r "console\.warn" server/src/ client/src/
grep -r "console\.debug" server/src/ client/src/

# Exclude test files and node_modules
grep -r "console\." server/src/ client/src/ \
  --exclude-dir=node_modules \
  --exclude-dir=__tests__ \
  --exclude="*.test.*" \
  --exclude="*.spec.*"
```

### ✅ 10. Log Export Functionality

#### Test: Frontend Log Export

**Steps:**

1. Perform various operations to generate logs
2. Open browser console
3. Export logs:

   ```javascript
   // Get logs as JSON
   const logs = window.__logger.exportLogs();

   // Copy to clipboard
   copy(logs);

   // Verify format
   const parsed = JSON.parse(logs);
   console.log("Exported log count:", parsed.length);
   ```

4. Verify:
   - ✅ Logs are exported as valid JSON
   - ✅ All log fields are present
   - ✅ Timestamps are included
   - ✅ Logs are ordered chronologically

### ✅ 11. Configuration Verification

#### Test: Log Level Configuration

**Steps:**

1. Test different log levels:

**Backend:**

```bash
# Test INFO level (should hide debug logs)
LOG_LEVEL=info npm run dev

# Test DEBUG level (should show all logs)
LOG_LEVEL=debug npm run dev

# Test WARN level (should only show warn/error)
LOG_LEVEL=warn npm run dev
```

**Frontend:**

```bash
# Test different levels
VITE_LOG_LEVEL=info npm run dev
VITE_LOG_LEVEL=debug npm run dev
VITE_LOG_LEVEL=warn npm run dev
```

2. Verify:
   - ✅ Debug logs only appear when LOG_LEVEL=debug
   - ✅ Info logs appear at info level and below
   - ✅ Warn/error logs always appear
   - ✅ Configuration changes take effect

#### Test: Production vs Development

**Steps:**

1. Test production mode:

```bash
# Backend
NODE_ENV=production npm run dev

# Frontend
npm run build
npm run preview
```

2. Verify:
   - ✅ Production logs are JSON formatted (backend)
   - ✅ Development logs are pretty-printed (backend)
   - ✅ Debug logs are hidden in production
   - ✅ Log storage works in both modes (frontend)

## Validation Results Template

Use this template to record validation results:

```markdown
# Comprehensive Logging Validation Results

**Date:** [Date]
**Validator:** [Name]
**Environment:** [Development/Staging/Production]

## Backend Service Logging

- [ ] EnhancementService logs correctly
- [ ] CacheService logs correctly
- [ ] All services include operation and duration
- [ ] All services use child loggers

**Issues Found:** [None / List issues]

## API Route Logging

- [ ] Request logging includes requestId
- [ ] Response logging includes status and duration
- [ ] Error logging includes Error object and stack trace
- [ ] Headers are sanitized

**Issues Found:** [None / List issues]

## Frontend Component Logging

- [ ] PromptCanvas logs user actions
- [ ] SuggestionsPanel logs panel state changes
- [ ] PromptInput logs mode changes and submissions
- [ ] All components use useDebugLogger

**Issues Found:** [None / List issues]

## Frontend Hook Logging

- [ ] usePromptHistory logs all operations with timing
- [ ] usePromptDebugger logs fetch operations
- [ ] useHierarchyValidation logs validation results
- [ ] All hooks include duration measurements

**Issues Found:** [None / List issues]

## Error Logging

- [ ] Backend errors use error() with Error object
- [ ] Frontend errors include component context
- [ ] Stack traces are present
- [ ] Duration logged even on failure

**Issues Found:** [None / List issues]

## Sensitive Data Protection

- [ ] Headers are sanitized (authorization, api-key, cookie)
- [ ] Email addresses are not logged (only domains)
- [ ] Passwords never logged
- [ ] API keys never logged
- [ ] Large payloads are summarized

**Issues Found:** [None / List issues]

## Performance Timing

- [ ] All async operations log duration
- [ ] Duration is in milliseconds
- [ ] Duration is reasonable (not 0 or negative)
- [ ] Timers are cleaned up on error

**Issues Found:** [None / List issues]

## Metadata Consistency

- [ ] All logs include operation field
- [ ] All logs include service/component field
- [ ] Timed operations include duration
- [ ] HTTP requests include requestId
- [ ] User operations include userId (where available)

**Issues Found:** [None / List issues]

## Console Statement Elimination

- [ ] No console.log in production code
- [ ] No console.error in production code
- [ ] No console.warn in production code
- [ ] No console.debug in production code

**Issues Found:** [None / List issues]

## Log Export

- [ ] Frontend logs can be exported
- [ ] Exported logs are valid JSON
- [ ] All fields are present
- [ ] Logs are chronologically ordered

**Issues Found:** [None / List issues]

## Configuration

- [ ] LOG_LEVEL environment variable works
- [ ] VITE_LOG_LEVEL environment variable works
- [ ] Debug logs hidden in production
- [ ] JSON format in production (backend)
- [ ] Pretty-print in development (backend)

**Issues Found:** [None / List issues]

## Overall Assessment

- [ ] All validation checks passed
- [ ] Ready for production

**Summary:** [Brief summary of validation results]

**Recommendations:** [Any recommendations for improvements]
```

## Automated Validation Scripts

### Backend Log Verification

```bash
#!/bin/bash
# scripts/validate-backend-logging.sh

echo "Validating backend logging..."

# Check for console statements
echo "Checking for console statements..."
CONSOLE_COUNT=$(grep -r "console\." server/src/ --exclude-dir=node_modules --exclude-dir=__tests__ | wc -l)
if [ $CONSOLE_COUNT -eq 0 ]; then
  echo "✅ No console statements found"
else
  echo "❌ Found $CONSOLE_COUNT console statements"
  grep -r "console\." server/src/ --exclude-dir=node_modules --exclude-dir=__tests__
fi

# Check for incorrect warn/info/debug signatures
echo "Checking for incorrect logger signatures..."
INCORRECT_SIGS=$(grep -rPn "\.(warn|info|debug)\s*\([^)]+,[^)]+,[^)]+\)" server/src/ --include="*.ts" --include="*.js" | wc -l)
if [ $INCORRECT_SIGS -eq 0 ]; then
  echo "✅ No incorrect logger signatures found"
else
  echo "❌ Found $INCORRECT_SIGS incorrect signatures"
  grep -rPn "\.(warn|info|debug)\s*\([^)]+,[^)]+,[^)]+\)" server/src/ --include="*.ts" --include="*.js"
fi

echo "Backend validation complete"
```

### Frontend Log Verification

```bash
#!/bin/bash
# scripts/validate-frontend-logging.sh

echo "Validating frontend logging..."

# Check for console statements
echo "Checking for console statements..."
CONSOLE_COUNT=$(grep -r "console\." client/src/ --exclude-dir=node_modules --exclude-dir=__tests__ | wc -l)
if [ $CONSOLE_COUNT -eq 0 ]; then
  echo "✅ No console statements found"
else
  echo "❌ Found $CONSOLE_COUNT console statements"
  grep -r "console\." client/src/ --exclude-dir=node_modules --exclude-dir=__tests__
fi

# Check for incorrect logger signatures
echo "Checking for incorrect logger signatures..."
INCORRECT_SIGS=$(grep -rPn "\.(warn|info|debug)\s*\([^)]+,[^)]+,[^)]+\)" client/src/ --include="*.ts" --include="*.tsx" | wc -l)
if [ $INCORRECT_SIGS -eq 0 ]; then
  echo "✅ No incorrect logger signatures found"
else
  echo "❌ Found $INCORRECT_SIGS incorrect signatures"
  grep -rPn "\.(warn|info|debug)\s*\([^)]+,[^)]+,[^)]+\)" client/src/ --include="*.ts" --include="*.tsx"
fi

echo "Frontend validation complete"
```

## Success Criteria

The validation is successful when:

1. ✅ All backend services log operations with timing
2. ✅ All API routes log requests/responses with requestId
3. ✅ All frontend components use useDebugLogger
4. ✅ All frontend hooks log async operations with timing
5. ✅ All errors are logged with Error objects and stack traces
6. ✅ No sensitive data appears in logs
7. ✅ All async operations log duration
8. ✅ All logs include standard metadata fields
9. ✅ No console statements in production code
10. ✅ Log export functionality works
11. ✅ Configuration changes take effect
12. ✅ Timing measurements are accurate

## Troubleshooting

### Issue: Logs not appearing

**Solution:**

- Check LOG_LEVEL / VITE_LOG_LEVEL environment variables
- Verify logger is imported correctly
- Check browser console for frontend logs
- Check terminal output for backend logs

### Issue: Missing duration in logs

**Solution:**

- Verify startTimer() is called at operation start
- Verify endTimer() is called on both success and error paths
- Check that operation name matches between start and end

### Issue: Sensitive data in logs

**Solution:**

- Use sanitizeHeaders() for HTTP headers
- Use sanitizeUserData() for user objects
- Use redactSensitiveFields() for request bodies
- Use summarize() for large payloads

### Issue: Console statements still present

**Solution:**

- Run grep search to find remaining console statements
- Replace with appropriate logger calls
- Verify imports are correct

## Next Steps After Validation

1. **Document Issues**: Record any issues found during validation
2. **Fix Issues**: Address any problems discovered
3. **Re-validate**: Run validation again after fixes
4. **Production Deployment**: Once validation passes, deploy to production
5. **Monitor**: Set up log monitoring and alerting
6. **Iterate**: Continuously improve logging based on production insights

## Conclusion

This manual validation guide ensures comprehensive verification of the logging implementation. Follow each section systematically to confirm that all logging requirements are met and the system is ready for production use.
