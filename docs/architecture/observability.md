# Observability

Vidra runs no error-tracking, analytics or metrics service. Server and client Sentry, PostHog operational events, Firebase Analytics, web-vitals reporting and the optional metrics sinks were removed on 2026-10-20: server Sentry was never initialized, PostHog was off in production, and nobody read the rest. Add a collector only together with the person who will read it.

## Server logs

- [Logger](../../server/src/infrastructure/Logger.ts) writes Pino structured logs. Signatures live in [ILogger](../../server/src/interfaces/ILogger.ts).
- [requestId middleware](../../server/src/middleware/requestId.ts) sets `X-Request-Id` and the AsyncLocalStorage [request context](../../server/src/infrastructure/requestContext.ts); every log line inside a request carries that `requestId`.
- [errorHandler](../../server/src/middleware/errorHandler.ts) redacts PII from the request body it logs and from error details it returns. Keep sanitization at the boundaries where data leaves the process.

## Client logs

[LoggingService](../../client/src/services/LoggingService.ts) is a thin console wrapper. Console output stays in the browser, so it is not redacted; redact only data that is sent off the device.

## Evaluation

Deterministic span-labeling evaluation uses `scripts/evaluation/golden-set-relaxed-f1.ts` and its blessed baselines. It writes `scripts/evaluation/golden-set-results-latest.json` and exits non-zero on a regression.
