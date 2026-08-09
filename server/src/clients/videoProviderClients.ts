import OpenAI from "openai";
import Replicate from "replicate";
import { LumaAI } from "lumaai";

/**
 * SDK construction for the video-generation providers.
 *
 * One factory per provider rather than one struct holding all of them: the
 * shared `VideoProviderSdks` bag meant every provider's constructor reached
 * into a type that named all five, so adding or removing one edited a file
 * belonging to the other four. Each provider now takes only its own client.
 *
 * `clients/` still owns SDK instantiation — see server/CLAUDE.md — so the
 * provider classes stay free of `new Replicate(...)`.
 */

type WarnSink = {
  warn: (message: string, meta?: Record<string, unknown>) => void;
};

const TRAILING_SLASH_REGEX = /\/+$/;

/**
 * Apply a provider's default base URL and strip trailing slashes.
 *
 * Exported because the Kling and Veo providers speak raw HTTP and normalize
 * their own base URL. An un-trimmed operator-supplied value
 * (`KLING_BASE_URL=https://api.klingai.com/`) produces double-slash request
 * paths against a live provider, which is why this is not inlined.
 */
export function normalizeBaseUrl(
  candidate: string | undefined,
  fallback: string,
): string {
  return (candidate || fallback).replace(TRAILING_SLASH_REGEX, "");
}

export function createReplicateVideoClient(
  apiToken: string | undefined,
  log: WarnSink,
): Replicate | null {
  if (!apiToken) {
    log.warn(
      "REPLICATE_API_TOKEN not provided, Replicate-based video generation will be disabled",
    );
    return null;
  }
  return new Replicate({ auth: apiToken });
}

export function createSoraVideoClient(
  apiKey: string | undefined,
  log: WarnSink,
): OpenAI | null {
  if (!apiKey) {
    log.warn(
      "OPENAI_API_KEY not provided, Sora video generation will be disabled",
    );
    return null;
  }
  return new OpenAI({ apiKey });
}

export function createLumaVideoClient(
  apiKey: string | undefined,
  log: WarnSink,
): LumaAI | null {
  if (!apiKey) {
    log.warn(
      "LUMA_API_KEY or LUMAAI_API_KEY not provided, Luma video generation will be disabled",
    );
    return null;
  }
  return new LumaAI({ authToken: apiKey });
}

/**
 * Kling and Veo have no SDK — they are raw HTTP — so their "client" is the
 * credential itself. These exist so the missing-key warning stays uniform
 * across all five providers instead of only the three with SDKs.
 */
export function resolveKlingCredential(
  apiKey: string | undefined,
  log: WarnSink,
): string | null {
  if (!apiKey) {
    log.warn(
      "KLING_API_KEY not provided, Kling video generation will be disabled",
    );
    return null;
  }
  return apiKey;
}

export function resolveVeoCredential(
  apiKey: string | undefined,
  log: WarnSink,
): string | null {
  if (!apiKey) {
    log.warn(
      "GEMINI_API_KEY not provided, Veo video generation will be disabled",
    );
    return null;
  }
  return apiKey;
}
