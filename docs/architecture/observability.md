# Operational telemetry

Current operational telemetry remains active; the retired Measurement Program, synthetic traffic jobs, quality judge and calibration schedules are removed.

## Source and attribution

Request-source discrimination is defined by [telemetry types](../../shared/types/telemetry.ts), request telemetry middleware and the PostHog wrapper. Historical `synthetic` event values remain readable; they do not imply an installed harness or nightly program. Preserve source/actor/trace attribution and the existing event allowlists when changing instrumentation.

## Owners

- [OptimizeTelemetryService](../../server/src/services/observability/OptimizeTelemetryService.ts): optimization stages, cache, completion and deterministic intent/lint outcomes.
- [SuggestionsTelemetryService](../../server/src/services/observability/SuggestionsTelemetryService.ts): selected-phrase suggestions and outcomes.
- [SpanLabelingTelemetryService](../../server/src/services/observability/SpanLabelingTelemetryService.ts): labeling execution and completion.
- [LlmCallTelemetryService](../../server/src/services/observability/LlmCallTelemetryService.ts): external LLM calls through `aiService`.
- [PostHogClient](../../server/src/infrastructure/PostHogClient.ts): emission and shutdown behavior.

Services tolerate unavailable telemetry without changing product outcomes. Preserve logging sanitization and trace/event contracts; operational events are not proof of provider output quality.

## Evaluation and proof

Deterministic span-labeling evaluation uses `scripts/evaluation/golden-set-relaxed-f1.ts` and its blessed baselines. Offline replay proves wiring/recovery. Provider-quality tooling and bounded live smoke report their own evidence limits. No removed judge/dashboard/calendar program is a current release requirement.

See [cross-mode contracts](cross-mode-golden-path.md). Server logging signatures live in [ILogger](../../server/src/interfaces/ILogger.ts); browser logging lives in [LoggingService](../../client/src/services/LoggingService.ts).
