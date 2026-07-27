/**
 * Video Prompt Analysis Service - Barrel Export
 *
 * Deliberately narrow: `VideoPromptService` is the module's only entry point
 * for consumers outside this directory. Everything else is reached by deep
 * import from within the module, so a re-export here would only be a second
 * name for code that has no external caller.
 */

export { VideoPromptService } from "./VideoPromptService";
export type { VideoPromptServiceDeps } from "./VideoPromptService";
