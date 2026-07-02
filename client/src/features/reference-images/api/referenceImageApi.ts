import { API_CONFIG } from "@/config/api.config";
import { buildFirebaseAuthHeaders } from "@/services/http/firebaseAuth";
import { ReferenceImageListSchema, ReferenceImageSchema } from "./schemas";
import { ApiSuccessResponseSchema } from "@shared/schemas/api.schemas";
import type { ReferenceImage } from "@shared/schemas/asset.schemas";

export type { ReferenceImage };

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const authHeaders = await buildFirebaseAuthHeaders();
  const headers = new Headers(options.headers ?? {});
  Object.entries(authHeaders).forEach(([key, value]) => {
    if (typeof value === "string") {
      headers.set(key, value);
    }
  });
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(
    `${API_CONFIG.baseURL}/reference-images${endpoint}`,
    {
      ...options,
      headers,
    },
  );

  if (response.status === 204) {
    return null;
  }

  let payload: Record<string, unknown> | null = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorMsg = (payload?.error ??
      payload?.message ??
      "Reference image API error") as string;
    throw new Error(errorMsg);
  }

  return payload;
}

export const referenceImageApi = {
  async list(limit?: number): Promise<ReferenceImage[]> {
    const query = Number.isFinite(limit) ? `?limit=${limit}` : "";
    const payload = await fetchWithAuth(query);
    const parsed = ApiSuccessResponseSchema(ReferenceImageListSchema).safeParse(
      payload,
    );
    if (!parsed.success) {
      throw new Error("Invalid reference image list response");
    }
    return parsed.data.data.images;
  },

  async upload(
    file: File,
    options: { label?: string; source?: string } = {},
  ): Promise<ReferenceImage> {
    const formData = new FormData();
    formData.append("file", file);
    if (options.label) {
      formData.append("label", options.label);
    }
    if (options.source) {
      formData.append("source", options.source);
    }

    const payload = await fetchWithAuth("/", {
      method: "POST",
      body: formData,
    });

    return ApiSuccessResponseSchema(ReferenceImageSchema).parse(payload).data;
  },

  async uploadFromUrl(
    sourceUrl: string,
    options: { label?: string; source?: string } = {},
  ): Promise<ReferenceImage> {
    const payload = await fetchWithAuth("/from-url", {
      method: "POST",
      body: JSON.stringify({
        sourceUrl,
        ...(options.label ? { label: options.label } : {}),
        ...(options.source ? { source: options.source } : {}),
      }),
    });
    return ApiSuccessResponseSchema(ReferenceImageSchema).parse(payload).data;
  },

  async delete(imageId: string): Promise<void> {
    await fetchWithAuth(`/${encodeURIComponent(imageId)}`, {
      method: "DELETE",
    });
  },
};

export default referenceImageApi;
