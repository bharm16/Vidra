# Video Prompt Analysis

Detects video prompts, analyses them into a structured IR, and rewrites that IR into a model-native prompt.

## Entry point

`VideoPromptService` is the only export in `index.ts` — everything else is reached by deep import from inside this directory. It is registered as `videoPromptService` in `server/src/config/services/enhancement.services.ts` and has two production consumers:

- `EnhancementService` — uses the detection and guidance helpers (`isVideoPrompt`, `getCategoryFocusGuidance`) on the `/api/enhancement/suggestions` path.
- `VideoPromptCompilationService` — calls `optimizeForModel`, the strategy pipeline, on the `/api/optimize-compile` path.

## Layout

| Path                    | Role                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `VideoPromptService.ts` | Orchestrator: detection, phrase-role analysis, constraints, guidance, `optimizeForModel` |
| `strategies/`           | Per-model pipeline (`BaseStrategy` + Runway/Luma/Kling/Sora/Veo/Wan) and its registry    |
| `services/analysis/`    | `VideoPromptAnalyzer` — raw text → `VideoPromptIR`                                       |
| `services/rewriter/`    | `VideoPromptLLMRewriter` + per-model prompt builders                                     |
| `services/detection/`   | Video-prompt, target-model and template-section detection                                |
| `services/guidance/`    | `CategoryGuidanceService`                                                                |
| `utils/`                | `TechStripper` (placebo/camera-spec removal), `SafetySanitizer`, text helpers            |
| `config/`               | Declarative detection markers, category mapping, constraint modes, category guidance     |

Model ids are the canonical ones in `shared/videoModels.ts`; alias resolution belongs to `resolveCanonicalPromptModelId` / `resolvePromptModelId` — do not add local alias maps.

## LLM calls

`BaseStrategy.transform` makes **two sequential** calls, both on Gemini 2.5 Flash with an OpenAI fallback (`server/src/config/modelConfig.ts`):

| Step                             | executionType                | Timeout  |
| -------------------------------- | ---------------------------- | -------- |
| `VideoPromptAnalyzer.analyze`    | `video_prompt_ir_extraction` | 30 000ms |
| `VideoPromptLLMRewriter.rewrite` | `video_prompt_rewrite`       | 45 000ms |

The analyzer call is skipped only when `context.precomputedStructuredPrompt` is supplied. That 75 000ms worst-case budget is what the client compile deadline is derived from: `COMPILE_TIMEOUT_MS` in `client/src/features/generations/api/compilePrompt.ts`.

## Test coverage

The replay merge gate (`npm run test:replay`) exercises this module only through the `/api/enhancement/suggestions` scenario, which touches the detection and guidance helpers. **The strategy pipeline is not in the gate** — there is no golden scenario for `/api/optimize-compile`. Its safety net is the unit and property suites (`strategies/__tests__/`, `utils/__tests__/`, `tests/unit/video-prompt-*`).
