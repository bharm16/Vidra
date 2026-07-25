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
  };
  redis: {
    defaultTTL: number;
    shortTTL: number;
    maxMemoryCacheSize: number;
  };
  server: {
    port: string | number;
    environment: string | undefined;
  };
  stripe: {
    secretKey: string | undefined;
    webhookSecret: string | undefined;
    priceCreditsJson: string | undefined;
    webhookReconciliation: {
      disabled: boolean;
      intervalSeconds: number;
      lookbackHours: number;
    };
    profileRepair: {
      disabled: boolean;
      intervalSeconds: number;
      maxPerRun: number;
      maxAttempts: number;
    };
  };
  credits: {
    refundSweeper: {
      disabled: boolean;
      intervalSeconds: number;
      maxPerRun: number;
      maxAttempts: number;
    };
    reconciliation: {
      disabled: boolean;
      incrementalIntervalSeconds: number;
      fullIntervalHours: number;
      maxIntervalSeconds: number;
      backoffFactor: number;
      incrementalScanLimit: number;
      fullPassPageSize: number;
    };
  };
  videoJobs: {
    maxAttempts: number;
    hostname: string | undefined;
    sweeper: {
      disabled: boolean;
      staleQueueSeconds: number;
      staleProcessingSeconds: number;
      sweepIntervalSeconds: number;
      sweepMax: number;
    };
    worker: {
      pollIntervalMs: number;
      leaseSeconds: number;
      maxConcurrent: number;
      heartbeatIntervalMs: number;
      perProviderMaxConcurrent: number | undefined;
    };
    dlqReprocessor: {
      disabled: boolean;
      pollIntervalMs: number;
      maxEntriesPerRun: number;
    };
    providerCircuit: {
      failureRateThreshold: number;
      minVolume: number;
      cooldownMs: number;
      maxSamples: number;
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
    reconciler: {
      disabled: boolean;
      orphanThresholdMs: number;
      reconcileIntervalMs: number;
      maxObjectsPerRun: number;
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
      openAIKey: string | undefined;
      lumaApiKey: string | undefined;
      klingApiKey: string | undefined;
      klingBaseUrl: string | undefined;
      geminiApiKey: string | undefined;
      geminiBaseUrl: string | undefined;
    };
  };
  convergence: {
    depth: {
      warmupRetryTimeoutMs: number;
      falWarmupEnabled: boolean;
      falWarmupIntervalMs: number;
      falWarmupImageUrl: string | undefined;
      warmupOnStartup: boolean;
      warmupTimeoutMs: number;
    };
    storage: {
      signedUrlTtlSeconds: number;
    };
  };
  continuity: {
    ipAdapterModel: string;
    disableClip: boolean;
  };
  capabilities: {
    probeUrl: string | undefined;
    probePath: string | undefined;
    probeRefreshMs: number;
  };
  promptOptimization: {
    shotPlanCacheTtlMs: number;
    shotPlanCacheMax: number;
  };
  enhancement: {
    policyVersion: string;
  };
  features: {
    faceEmbedding: boolean;
  };
  firestore: {
    circuit: {
      timeoutMs: number;
      errorThresholdPercent: number;
      resetTimeoutMs: number;
      minVolume: number;
      maxRetries: number;
      retryBaseDelayMs: number;
      retryJitterMs: number;
    };
    readiness: {
      maxFailureRate: number;
      maxLatencyMs: number;
    };
  };
  idempotency: {
    pendingLockTtlMs: number;
    replayTtlMs: number;
  };
}
