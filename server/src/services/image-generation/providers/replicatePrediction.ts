/**
 * Shared Replicate prediction helpers.
 *
 * Pure response/error parsing reused by the Flux preview providers
 * (Schnell and Kontext Fast), which speak the identical Replicate
 * prediction protocol. Provider-specific concerns (model id, input
 * shaping, polling, the create-with-retry loop that tests spy on) stay
 * in each provider.
 */

import type { ILogger } from "@interfaces/ILogger";

/**
 * Extract a retry delay (ms) from a Replicate rate-limit error message.
 * Reads `retry_after_ms` / `retry_after` from an embedded JSON body, then
 * falls back to a loose `retry_after: <seconds>` scan. Returns null when no
 * delay can be determined.
 */
export function parseRetryAfterMs(message: string): number | null {
  try {
    const jsonMatch = message.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const errorData = JSON.parse(jsonMatch[0]) as {
        retry_after?: number | string;
        retry_after_ms?: number | string;
      };
      if (errorData.retry_after_ms !== undefined) {
        const value =
          typeof errorData.retry_after_ms === "string"
            ? Number.parseFloat(errorData.retry_after_ms)
            : errorData.retry_after_ms;
        return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
      }
      if (errorData.retry_after !== undefined) {
        const value =
          typeof errorData.retry_after === "string"
            ? Number.parseFloat(errorData.retry_after)
            : errorData.retry_after;
        return Number.isFinite(value)
          ? Math.max(0, Math.round(value * 1000))
          : null;
      }
    }
  } catch {
    return null;
  }

  const match = message.match(/retry_after[^0-9]*(\d+(?:\.\d+)?)/i);
  if (match?.[1]) {
    const seconds = Number.parseFloat(match[1]);
    return Number.isFinite(seconds)
      ? Math.max(0, Math.round(seconds * 1000))
      : null;
  }

  return null;
}

/**
 * Pull a human-readable `detail`/`title` from a Replicate error body, falling
 * back to the provided message when none is present.
 */
export function parseReplicateErrorDetail(
  message: string,
  fallback: string,
): string {
  try {
    const jsonMatch = message.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const errorData = JSON.parse(jsonMatch[0]) as {
        detail?: string;
        title?: string;
      };
      return errorData.detail || errorData.title || fallback;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

/**
 * Normalize the many shapes a Replicate prediction `output` can take
 * (string, array of strings/objects, or a status-wrapped object) into a
 * single image URL. Throws with a diagnostic message when no URL is found.
 */
export function extractImageUrl(
  output: unknown,
  userId: string,
  log: ILogger,
): string {
  let imageUrl: string | null = null;

  if (typeof output === "string") {
    imageUrl = output;
  } else if (Array.isArray(output)) {
    const stringUrl = output.find(
      (item): item is string =>
        typeof item === "string" &&
        (item.startsWith("http://") || item.startsWith("https://")),
    );

    if (stringUrl) {
      imageUrl = stringUrl;
    } else {
      for (const item of output) {
        if (item && typeof item === "object") {
          const itemObj = item as Record<string, unknown>;
          const urlFromObject =
            itemObj.url ||
            itemObj.imageUrl ||
            itemObj.output ||
            itemObj.src ||
            (Array.isArray(itemObj.urls) ? itemObj.urls[0] : null) ||
            (Array.isArray(itemObj.files) ? itemObj.files[0] : null);

          if (
            urlFromObject &&
            typeof urlFromObject === "string" &&
            (urlFromObject.startsWith("http://") ||
              urlFromObject.startsWith("https://"))
          ) {
            imageUrl = urlFromObject;
            break;
          }
        }
      }

      if (!imageUrl && output.length === 1 && typeof output[0] === "object") {
        const firstItem = output[0] as Record<string, unknown>;
        const keys = Object.keys(firstItem);

        log.warn("Array contains object but no URL found", {
          objectKeys: keys,
          objectValue: JSON.stringify(firstItem, null, 2).substring(0, 500),
          userId,
        });
      }
    }
  } else if (output && typeof output === "object") {
    const outputObj = output as Record<string, unknown>;

    if ("status" in outputObj) {
      if (outputObj.status === "succeeded" && outputObj.output) {
        if (typeof outputObj.output === "string") {
          imageUrl = outputObj.output;
        } else if (Array.isArray(outputObj.output)) {
          const url =
            outputObj.output.find(
              (item) =>
                typeof item === "string" &&
                (item.startsWith("http://") || item.startsWith("https://")),
            ) || outputObj.output[0];
          imageUrl = typeof url === "string" ? url : null;
        }
      } else if (outputObj.status !== "succeeded") {
        throw new Error(
          `Image generation failed with status: ${outputObj.status}${outputObj.error ? ". " + outputObj.error : ""}`,
        );
      }
    }

    if (!imageUrl) {
      const url =
        outputObj.url ||
        outputObj.imageUrl ||
        outputObj.output ||
        (Array.isArray(outputObj.files) ? outputObj.files[0] : null) ||
        (outputObj.urls && Array.isArray(outputObj.urls)
          ? outputObj.urls[0]
          : null);
      imageUrl = typeof url === "string" ? url : null;
    }
  }

  if (!imageUrl || typeof imageUrl !== "string") {
    const errorDetails: Record<string, unknown> = {
      output: JSON.stringify(output, null, 2).substring(0, 2000),
      outputType: typeof output,
      isArray: Array.isArray(output),
      userId,
    };

    log.error(
      "Unexpected Replicate response format",
      new Error("Unexpected Replicate response format"),
      errorDetails,
    );

    if (
      Array.isArray(output) &&
      output.length > 0 &&
      typeof output[0] === "object" &&
      Object.keys(output[0]).length === 0
    ) {
      throw new Error(
        "Replicate API returned an empty response. The image generation may have failed or the model is still processing. Please try again.",
      );
    }

    throw new Error(
      "Invalid response from Replicate API: no image URL returned.",
    );
  }

  return imageUrl;
}
