/**
 * Video Template Builder Factory
 *
 * Maps the provider that will run the optimization onto the builder that
 * shapes its template.
 *
 * The provider is supplied by the caller from
 * `aiService.resolveExecution("optimize_standard")` — the router's answer,
 * which accounts for client availability and circuit state. It is not
 * re-derived here.
 *
 * The four concrete builders are the implementation of this mapping, not part
 * of its interface: they used to be re-exported so callers could bypass the
 * factory, and the only thing that ever did was a test.
 */

import { logger } from "@infrastructure/Logger";
import { OpenAIVideoTemplateBuilder } from "./OpenAIVideoTemplateBuilder";
import { OpenAIVideoTemplateBuilderLocked } from "./OpenAIVideoTemplateBuilderLocked";
import { GroqVideoTemplateBuilder } from "./GroqVideoTemplateBuilder";
import { GroqVideoTemplateBuilderLocked } from "./GroqVideoTemplateBuilderLocked";
import type { BaseVideoTemplateBuilder } from "./BaseVideoTemplateBuilder";
import type { ProviderType } from "@utils/provider/ProviderDetector";

const log = logger.child({ service: "VideoTemplateBuilderFactory" });

type BuilderKey = "openai" | "openai-locked" | "groq" | "groq-locked";

const CONSTRUCTORS: Record<BuilderKey, () => BaseVideoTemplateBuilder> = {
  openai: () => new OpenAIVideoTemplateBuilder(),
  "openai-locked": () => new OpenAIVideoTemplateBuilderLocked(),
  groq: () => new GroqVideoTemplateBuilder(),
  "groq-locked": () => new GroqVideoTemplateBuilderLocked(),
};

/** Builders are stateless; one instance each is reused across requests. */
const instances = new Map<BuilderKey, BaseVideoTemplateBuilder>();

/**
 * Get the template builder for a provider.
 *
 * @param options.provider - From `aiService.resolveExecution(...)`. Anthropic,
 *   Gemini and unknown providers use the Groq template.
 * @param options.lockedSpans - Present and non-empty selects the locked-span
 *   variant of the same provider's builder.
 */
export function getVideoTemplateBuilder(options: {
  provider: ProviderType;
  lockedSpans?: Array<{ text: string }>;
}): BaseVideoTemplateBuilder {
  const family = options.provider === "openai" ? "openai" : "groq";
  const locked =
    Array.isArray(options.lockedSpans) && options.lockedSpans.length > 0;
  const key: BuilderKey = locked ? `${family}-locked` : family;

  let builder = instances.get(key);
  if (!builder) {
    builder = CONSTRUCTORS[key]();
    instances.set(key, builder);
    log.debug("Created video template builder", {
      operation: "getVideoTemplateBuilder",
      provider: options.provider,
      key,
    });
  }

  return builder;
}

export { BaseVideoTemplateBuilder } from "./BaseVideoTemplateBuilder";
export type {
  VideoTemplateContext,
  VideoTemplateResult,
} from "./BaseVideoTemplateBuilder";
