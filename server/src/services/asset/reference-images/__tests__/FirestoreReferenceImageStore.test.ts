import { beforeEach, describe, expect, it, vi } from "vitest";
import { FirestoreReferenceImageStore } from "../storage/FirestoreReferenceImageStore";

// Mock logger
vi.mock("@infrastructure/Logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    child: () => ({
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    }),
  },
}));

// Mock firebaseAdmin
vi.mock("@infrastructure/firebaseAdmin", () => ({
  getFirestore: vi.fn(() => createMockFirestore()),
}));

// Mock urlValidation
vi.mock("@server/shared/urlValidation", () => ({
  assertUrlSafe: vi.fn(),
}));

// Mock ReferenceImageProcessor
vi.mock("@services/asset/ReferenceImageProcessingService", () => ({
  ReferenceImageProcessingService: vi.fn().mockImplementation(() => ({
    processImage: vi.fn().mockResolvedValue({
      buffer: Buffer.from("processed"),
      width: 1024,
      height: 768,
      sizeBytes: 2048,
    }),
    generateThumbnail: vi.fn().mockResolvedValue({
      buffer: Buffer.from("thumb"),
      width: 256,
      height: 192,
      sizeBytes: 512,
    }),
  })),
}));

function createMockFirestore() {
  const mockDoc = {
    id: "test-id",
    exists: true,
    data: vi.fn().mockReturnValue({
      id: "ref_abc123",
      userId: "user-1",
      storagePath: "users/user-1/reference-images/ref_abc123.jpg",
      thumbnailPath: "users/user-1/reference-images/ref_abc123_thumb.jpg",
    }),
    ref: { id: "test-id" },
  };

  const mockCollection = {
    doc: vi.fn().mockReturnValue({
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(mockDoc),
      delete: vi.fn().mockResolvedValue(undefined),
    }),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({
      docs: [mockDoc],
    }),
  };

  return {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        collection: vi.fn().mockReturnValue(mockCollection),
      }),
    }),
  };
}

function createMockBucket(name = "test-bucket") {
  return {
    name,
    file: vi.fn().mockReturnValue({
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      getSignedUrl: vi
        .fn()
        .mockResolvedValue(["https://storage.googleapis.com/test-bucket/signed"]),
    }),
  } as unknown as ConstructorParameters<
    typeof FirestoreReferenceImageStore
  >[0]["bucket"];
}

describe("FirestoreReferenceImageStore", () => {
  let service: FirestoreReferenceImageStore;
  let mockBucket: ReturnType<typeof createMockBucket>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBucket = createMockBucket();
    service = new FirestoreReferenceImageStore({ bucket: mockBucket });
  });

  describe("constructor", () => {
    it("throws when bucket is not provided", () => {
      expect(
        () =>
          new FirestoreReferenceImageStore({
            bucket: undefined as unknown as ConstructorParameters<
              typeof FirestoreReferenceImageStore
            >[0]["bucket"],
          }),
      ).toThrow(
        "FirestoreReferenceImageStore requires an injected storage bucket",
      );
    });

    it("accepts custom bucket name", () => {
      const svc = new FirestoreReferenceImageStore({
        bucket: mockBucket,
        bucketName: "custom-bucket",
      });
      expect(svc).toBeDefined();
    });
  });

  describe("listImages", () => {
    it("returns list of reference image records", async () => {
      const images = await service.listImages("user-1");
      expect(images).toHaveLength(1);
      expect(images[0]).toHaveProperty("id");
    });

    it("respects limit option", async () => {
      await service.listImages("user-1", { limit: 10 });
      // Verifies no error thrown with limit
    });

    it("clamps limit between 1 and 200", async () => {
      await service.listImages("user-1", { limit: 0 });
      await service.listImages("user-1", { limit: 500 });
      await service.listImages("user-1", { limit: -1 });
      // Verifies no error thrown with out-of-range limits
    });
  });

  describe("createFromBuffer", () => {
    it("processes image and stores in bucket", async () => {
      const buffer = Buffer.from("test-image-data");
      const result = await service.createFromBuffer("user-1", buffer);

      expect(result.userId).toBe("user-1");
      expect(result.id).toMatch(/^ref_/);
      expect(result.imageUrl).toContain("storage.googleapis.com");
      expect(result.thumbnailUrl).toContain("storage.googleapis.com");
      expect(result.imageRef).toBe(result.id);
      expect(result.thumbnailRef).toBe(`${result.id}:thumbnail`);
      expect(result).not.toHaveProperty("storagePath");
      expect(result).not.toHaveProperty("thumbnailPath");
      expect(result.metadata.width).toBe(1024);
      expect(result.metadata.height).toBe(768);
      expect(result.metadata.contentType).toBe("image/jpeg");
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it("stores label and source metadata", async () => {
      const buffer = Buffer.from("test-image-data");
      const result = await service.createFromBuffer("user-1", buffer, {
        label: "hero-shot",
        source: "upload",
        originalName: "photo.png",
      });

      expect(result.label).toBe("hero-shot");
      expect(result.metadata.source).toBe("upload");
      expect(result.metadata.originalName).toBe("photo.png");
    });

    it("defaults label and source to null when not provided", async () => {
      const buffer = Buffer.from("test-image-data");
      const result = await service.createFromBuffer("user-1", buffer);

      expect(result.label).toBeNull();
      expect(result.metadata.source).toBeNull();
      expect(result.metadata.originalName).toBeNull();
    });

    it("uploads both full image and thumbnail to storage", async () => {
      const buffer = Buffer.from("test-image-data");
      await service.createFromBuffer("user-1", buffer);

      const bucketAny = mockBucket as unknown as {
        file: ReturnType<typeof vi.fn>;
      };
      // Two writes plus two fresh presentation-url mints. Neither Firestore
      // document receives a Firebase bearer-token URL.
      expect(bucketAny.file).toHaveBeenCalledTimes(4);
    });

    it("propagates processor errors", async () => {
      const { ReferenceImageProcessingService: MockProcessor } = await import(
        "@services/asset/ReferenceImageProcessingService"
      );
      const mockInstance = new MockProcessor();
      const castInstance = mockInstance as unknown as {
        processImage: ReturnType<typeof vi.fn>;
      };
      castInstance.processImage.mockRejectedValueOnce(
        new Error("Invalid image format"),
      );

      const svc = new FirestoreReferenceImageStore({
        bucket: mockBucket,
        processor: mockInstance,
      });

      await expect(
        svc.createFromBuffer("user-1", Buffer.from("bad")),
      ).rejects.toThrow("Invalid image format");
    });
  });

  describe("createFromUrl", () => {
    it("fetches URL and delegates to createFromBuffer", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(new Uint8Array(100), {
            headers: { "content-type": "image/jpeg" },
          }),
        ),
      );

      const result = await service.createFromUrl(
        "user-1",
        "https://example.com/image.jpg",
      );

      expect(result.userId).toBe("user-1");
      expect(result.metadata.source).toBe("url");
      vi.unstubAllGlobals();
    });

    it("throws when fetch fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          statusText: "Not Found",
        }),
      );

      await expect(
        service.createFromUrl("user-1", "https://example.com/missing.jpg"),
      ).rejects.toThrow("Failed to fetch remote media: 404 Not Found");

      vi.unstubAllGlobals();
    });

    it("preserves custom source when provided", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(new Uint8Array(100), {
            headers: { "content-type": "image/jpeg" },
          }),
        ),
      );

      const result = await service.createFromUrl(
        "user-1",
        "https://example.com/image.jpg",
        {
          source: "custom-source",
        },
      );

      expect(result.metadata.source).toBe("custom-source");
      vi.unstubAllGlobals();
    });
  });

  describe("deleteImage", () => {
    it("returns false when image does not exist", async () => {
      // Override to return non-existent doc
      const mockDb = createMockFirestore();
      const mockDocRef = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        delete: vi.fn(),
      };
      mockDb.collection = vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue(mockDocRef),
          }),
        }),
      });

      const svc = new FirestoreReferenceImageStore({
        db: mockDb as unknown as FirebaseFirestore.Firestore,
        bucket: mockBucket,
      });

      const result = await svc.deleteImage("user-1", "nonexistent");
      expect(result).toBe(false);
    });

    it("deletes storage files and firestore record", async () => {
      const mockDelete = vi.fn().mockResolvedValue(undefined);
      const mockDocDelete = vi.fn().mockResolvedValue(undefined);
      const mockDocRef = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            storagePath: "users/user-1/reference-images/ref_abc.jpg",
            thumbnailPath: "users/user-1/reference-images/ref_abc_thumb.jpg",
          }),
        }),
        delete: mockDocDelete,
      };

      const mockDb = {
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({
            collection: vi.fn().mockReturnValue({
              doc: vi.fn().mockReturnValue(mockDocRef),
            }),
          }),
        }),
      };

      const bucket = {
        name: "test-bucket",
        file: vi.fn().mockReturnValue({ delete: mockDelete }),
      } as unknown as ConstructorParameters<
        typeof FirestoreReferenceImageStore
      >[0]["bucket"];

      const svc = new FirestoreReferenceImageStore({
        db: mockDb as unknown as FirebaseFirestore.Firestore,
        bucket,
      });

      const result = await svc.deleteImage("user-1", "ref_abc");
      expect(result).toBe(true);
      expect(mockDelete).toHaveBeenCalledTimes(2);
      expect(mockDocDelete).toHaveBeenCalledOnce();
    });

    it("continues deleting when storage file deletion fails", async () => {
      const mockDocDelete = vi.fn().mockResolvedValue(undefined);
      const mockDocRef = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            storagePath: "users/user-1/ref.jpg",
            thumbnailPath: "users/user-1/ref_thumb.jpg",
          }),
        }),
        delete: mockDocDelete,
      };

      const mockDb = {
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({
            collection: vi.fn().mockReturnValue({
              doc: vi.fn().mockReturnValue(mockDocRef),
            }),
          }),
        }),
      };

      const bucket = {
        name: "test-bucket",
        file: vi.fn().mockReturnValue({
          delete: vi.fn().mockRejectedValue(new Error("Storage error")),
        }),
      } as unknown as ConstructorParameters<
        typeof FirestoreReferenceImageStore
      >[0]["bucket"];

      const svc = new FirestoreReferenceImageStore({
        db: mockDb as unknown as FirebaseFirestore.Firestore,
        bucket,
      });

      const result = await svc.deleteImage("user-1", "ref_abc");
      // Should still succeed and delete the Firestore record
      expect(result).toBe(true);
      expect(mockDocDelete).toHaveBeenCalledOnce();
    });
  });
});
