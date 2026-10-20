export interface ServiceConfig {
  openai: {
    apiKey: string | undefined;
    timeout: number;
    model: string;
  };
  groq: {
    apiKey: string | undefined;
    timeout: number;
    model: string;
  };
  qwen: {
    apiKey: string | undefined;
    timeout: number;
    model: string;
  };
  gemini: {
    apiKey: string | undefined;
    timeout: number;
    model: string;
    baseURL: string;
  };
  replicate: {
    apiToken: string | undefined;
  };
  studio: {
    /** Daily per-user spend cap in estimated cents (ADR-0019). */
    dailyCapCents: number;
  };
  fal: {
    apiKey: string | undefined;
    /** Daily per-creator sketch-relay admission cap in estimated cents (issue #84). */
    sketchDailyCapCents: number;
    /** Estimated cost of one dispatched sketch frame, in millicents (1 cent = 1000). */
    sketchFrameCostMillicents: number;
  };
  spanLabelingCache: {
    defaultTTL: number;
    shortTTL: number;
    maxMemoryCacheSize: number;
  };
  server: {
    port: string | number;
    environment: string | undefined;
  };
  credits: {
    refundSweeper: {
      disabled: boolean;
      intervalSeconds: number;
      maxPerRun: number;
      maxAttempts: number;
    };
  };
  videoJobs: {
    maxAttempts: number;
    hostname: string | undefined;
    worker: {
      pollIntervalMs: number;
      leaseSeconds: number;
      maxConcurrent: number;
      heartbeatIntervalMs: number;
    };
  };
  videoAssets: {
    retention: {
      disabled: boolean;
      retentionHours: number;
      cleanupIntervalMinutes: number;
      batchSize: number;
    };
    storage: {
      basePath: string;
      signedUrlTtlMs: number;
      cacheControl: string;
    };
    access: {
      tokenSecret: string | undefined;
      previousTokenSecrets?: readonly string[];
      tokenTtlSeconds: number;
    };
  };
  imageAssets: {
    storage: {
      basePath: string;
      signedUrlTtlMs: number;
      cacheControl: string;
    };
  };
  videoProviders: {
    pollTimeoutMs: number;
    workflowTimeoutMs: number;
    imagePreviewProvider: string | undefined;
    imagePreviewProviderOrder: string[];
    credentials: {
      replicateApiToken: string | undefined;
      geminiApiKey: string | undefined;
      geminiBaseUrl: string | undefined;
    };
  };
  promptOptimization: {
    shotPlanCacheTtlMs: number;
    shotPlanCacheMax: number;
  };
  enhancement: {
    policyVersion: string;
  };
  idempotency: {
    pendingLockTtlMs: number;
    replayTtlMs: number;
  };
}
