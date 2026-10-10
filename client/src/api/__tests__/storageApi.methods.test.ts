import { describe, it, expect, vi, beforeEach } from "vitest";

import { storageApi } from "@/api/storageApi";
import { buildFirebaseAuthHeaders } from "@/services/http/firebaseAuth";
import { API_CONFIG } from "@/config/api.config";

vi.mock("@/services/http/firebaseAuth", () => ({
  buildFirebaseAuthHeaders: vi.fn(),
}));

// storageApi now routes through the shared apiClient (via apiRequest); the
// mocked fetch responses therefore carry the full { success, data } success
// envelope the server actually sends (respond.ok), a status, and a headers
// object (the transport reads Retry-After on the error path).
describe("storageApi", () => {
  const mockBuildHeaders = vi.mocked(buildFirebaseAuthHeaders);
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchMock as typeof fetch;
    mockBuildHeaders.mockResolvedValue({ Authorization: "Bearer token" });
  });

  describe("edge cases", () => {
    it("builds query params for listFiles", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ success: true, data: { items: [] } }),
      } as Response);

      const result = await storageApi.listFiles({
        type: "image",
        limit: 5,
        cursor: "abc",
      });

      expect(result).toEqual({ items: [] });
      expect(global.fetch).toHaveBeenCalledWith(
        `${API_CONFIG.baseURL}/storage/list?type=image&limit=5&cursor=abc`,
        expect.any(Object),
      );
    });

    it("includes filename in the download URL query", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ success: true, data: { downloadUrl: "url" } }),
      } as Response);

      const result = await storageApi.getDownloadUrl(
        "path/to/file",
        "my-file.txt",
      );

      expect(result).toEqual({ downloadUrl: "url" });
      expect(global.fetch).toHaveBeenCalledWith(
        `${API_CONFIG.baseURL}/storage/download-url?path=path%2Fto%2Ffile&filename=my-file.txt`,
        expect.any(Object),
      );
    });
  });
});
