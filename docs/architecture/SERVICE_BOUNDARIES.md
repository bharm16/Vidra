# Service Boundaries

This document clarifies the responsibilities of the span and categorization
pipelines so similar services are not used interchangeably. It also describes
what each service expects as input, what it guarantees as output, and which
services it should (and should not) be paired with.

## Span labeling (prompt highlights)

- Entry points: `/llm/label-spans`, `server/src/llm/span-labeling/SpanLabelingService.ts`
- Primary responsibility: produce high-fidelity spans for the UI with stable offsets and
  taxonomy-aligned roles.
- Use when: PromptCanvas span highlighting, editor annotations, and any flow that
  renders or edits text based on span offsets.
- Inputs: full prompt text, span policy, optional constraints (minConfidence, maxSpans),
  and optional repair/validation flags.
- Outputs: `SpanLabelingResult` with spans that include offsets, roles, and confidence,
  plus metadata for tracing/diagnostics.
- Pipeline: `NlpSpanStrategy` fast path -> provider-specific LLM client ->
  schema validation -> span processing (dedupe, overlap, truncate, etc).
- Performance: can chunk large inputs for efficient processing.
- Caching: span labeling cache is request-scoped plus optional persistent cache via
  `SpanLabelingCacheService`.

## Video prompt analysis

- Entry points: `EnhancementService`, `VideoPromptService`
- Primary responsibility: detect prompt context (model/section/phrase role) and generate
  constraints/guidance for suggestion generation.
- Use when: generating enhancement suggestions, enforcing constraint modes, or applying
  model/section guidance for video prompts.
- Inputs: highlighted text, surrounding context, full prompt, explicit category hints,
  and (optionally) edit history.
- Outputs: phrase role, constraint mode, model target, and prompt section metadata.
- Dependency boundary: consumes labeled spans if available but does not produce spans.
- Avoid: Do not use this service as a span labeling substitute.

## NLP span extraction

- Entry point: `server/src/llm/span-labeling/nlp/NlpSpanService.ts`
- Primary responsibility: fast, rule- and model-based extraction to reduce LLM load.
- Use when: invoked internally by `SpanLabelingService` as Tier 1/2 extraction.
- Outputs: `NlpSpan[]` with lower-level spans that may be incomplete.
- Avoid: not a standalone API route and not suitable as a general span labeling API.

## Canonical import and composition rules

- Import service implementations from domain paths only (`server/src/services/enhancement/*`).
- Root-level compatibility shims are retired. Do not add or reintroduce
  `server/src/services/EnhancementService.ts`.
- Runtime feature-flag decisions belong at composition boundaries:
  `server/src/config/feature-flags.ts` and `server/src/config/routes.config.ts`.
- Route handlers and middleware should consume DI-injected services, not singleton imports.

## Decision guide

Use this quick checklist before wiring a new flow:

- Need UI highlight offsets or editor annotations -> use span labeling.
- Need guidance or constraints for suggestions -> use video prompt analysis.
- Need fast extraction without LLM -> only within span labeling.

## Anti-patterns

- Using video prompt analysis as a replacement for labeling.

## Rule of thumb

- Pick one labeling pipeline per request.
- If multiple signals are needed, derive them from a single pipeline output to avoid duplicate LLM calls.
