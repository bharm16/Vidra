import { z } from "zod";
import { apiRequest } from "@/services/apiRequest";

/**
 * Storage endpoints return the uniform `{ success, data }` envelope; per-endpoint
 * `data` shapes are intentionally `unknown` and narrowed by callers. Routing
 * through {@link apiRequest} validates the envelope at the wire (a non-object body
 * throws here instead of surfacing as a silent `undefined`) and inherits the
 * shared apiClient plumbing every call gets — Firebase auth headers, the
 * telemetry-source header, and the 401 → open-sign-in-and-retry transport.
 * (Validation boundary, not a transform — see CLAUDE.md "Anti-corruption layer".)
 */
function storageRequest(
  endpoint: string,
  init: { method?: string; body?: unknown } = {},
): Promise<unknown> {
  return apiRequest(`/storage${endpoint}`, z.unknown(), init);
}

export const storageApi = {
  getUploadUrl: (
    type: string,
    contentType: string,
    metadata: Record<string, unknown> = {},
  ) =>
    storageRequest("/upload-url", {
      method: "POST",
      body: { type, contentType, metadata },
    }),

  confirmUpload: (storagePath: string) =>
    storageRequest("/confirm-upload", {
      method: "POST",
      body: { storagePath },
    }),

  saveFromUrl: (
    sourceUrl: string,
    type: string,
    metadata: Record<string, unknown> = {},
  ) =>
    storageRequest("/save-from-url", {
      method: "POST",
      body: { sourceUrl, type, metadata },
    }),

  getViewUrl: (path: string) =>
    storageRequest(`/view-url?path=${encodeURIComponent(path)}`),

  getDownloadUrl: (path: string, filename?: string | null) => {
    const params = new URLSearchParams({ path });
    if (filename) {
      params.set("filename", filename);
    }
    return storageRequest(`/download-url?${params.toString()}`);
  },

  listFiles: (
    options: { type?: string; limit?: number; cursor?: string } = {},
  ) => {
    const params = new URLSearchParams();
    if (options.type) params.set("type", options.type);
    if (options.limit) params.set("limit", String(options.limit));
    if (options.cursor) params.set("cursor", options.cursor);
    const query = params.toString();
    return storageRequest(query ? `/list?${query}` : "/list");
  },

  getUsage: () => storageRequest("/usage"),

  deleteFile: (path: string) =>
    storageRequest(`/${encodeURI(path)}`, { method: "DELETE" }),

  deleteFiles: (paths: string[]) =>
    storageRequest("/delete-batch", {
      method: "POST",
      body: { paths },
    }),
};

export default storageApi;
