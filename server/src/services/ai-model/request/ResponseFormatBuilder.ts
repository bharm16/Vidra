import type { ProviderCapabilities } from "@utils/provider/ProviderDetector";
import type { ExecuteParams, ModelConfigEntry } from "../types";

export interface ResponseFormatResult {
  responseFormat?: { type: string; [key: string]: unknown };
  jsonMode: boolean;
}

export function buildResponseFormat(
  params: ExecuteParams,
  config: ModelConfigEntry,
  capabilities: ProviderCapabilities,
): ResponseFormatResult {
  let responseFormat: { type: string; [key: string]: unknown } | undefined;
  let jsonMode = false;

  if (params.schema) {
    responseFormat = {
      type: "json_schema",
      json_schema: {
        name: "video_prompt_response",
        strict: capabilities.strictJsonSchema && params.schema.strict !== false,
        schema: params.schema,
      },
    };
    jsonMode = false;
  } else if (params.responseFormat) {
    responseFormat = params.responseFormat;
    jsonMode = false;
  } else if (config.responseFormat === "json_object") {
    responseFormat = { type: "json_object" };
    jsonMode = true;
  } else {
    jsonMode = params.jsonMode || false;
  }

  return responseFormat ? { responseFormat, jsonMode } : { jsonMode };
}
