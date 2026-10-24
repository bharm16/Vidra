import { CreationRequestLifecycle } from "@services/creation-requests/lifecycle";
import type { DIContainer } from "@infrastructure/DIContainer";
import { getFirestore } from "@infrastructure/firebaseAdmin";
import { ProjectStore } from "@services/projects/ProjectStore";
import { ConversationStore } from "@services/projects/ConversationStore";
import { FolderStore } from "@services/projects/FolderStore";
import { CreationDraftStore } from "@services/creation-drafts/CreationDraftStore";
import { CreationContextService } from "@services/creation-context/CreationContextService";
import { RequestHistoryStore } from "@services/media-history/RequestHistoryStore";
import { MediaVersionIndex } from "@services/media-history/MediaVersionIndex";
import { WorkflowCapabilityCatalog } from "@services/creation-requests/catalog";
import { ActionPreparationService } from "@services/creation-requests/preparation";
import type { Bucket } from "@google-cloud/storage";
import { ProjectMediaService } from "@services/project-media/ProjectMediaService";
import { GcsProjectMediaStorage } from "@services/project-media/ProjectMediaStorage";

import type { VideoGenerationService } from "@services/video-generation/VideoGenerationService";
import type { ImagePreviewProvider } from "@services/image-generation/providers/types";
import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import type { StorageService } from "@services/storage/StorageService";
import type { ServiceConfig } from "./service-config.types";
import { WorkflowExecutionStore } from "@services/creation-requests/execution";
import { NativeWorkflowExecutor } from "@services/creation-requests/execution";
import { WorkflowExecutionService } from "@services/creation-requests/execution";
import { GcsWorkflowOutputStorage } from "@services/media-delivery/GcsWorkflowOutputStorage";
import { VideoEditStore } from "@services/video-editing/VideoEditStore";
import { VideoPreviewService } from "@services/video-editing/VideoPreviewService";
import { GcsExportStorage } from "@services/video-export/ExportStorage";
import { NativeVideoRenderer } from "@services/video-export/NativeVideoRenderer";
import { VideoExportService } from "@services/video-export/VideoExportService";
import { AccountUsageService } from "@services/account/AccountUsageService";
import { ProjectSketchService } from "@services/project-sketch/ProjectSketchService";
import { GcsProjectSketchStorage } from "@services/project-sketch/ProjectSketchStorage";

import { WorkflowManagementService } from "@services/workflow-sharing/WorkflowManagementService";
import { GcsWorkflowManagementStorage } from "@services/workflow-sharing/GcsWorkflowManagementStorage";

import { StudioWorkflowSpendGuard } from "@services/creation-requests/spend";
import { WorkflowSpendPolicySchema } from "@services/creation-requests/spend";
import { ReplicateModelRunner } from "@services/creation-requests/models";
import { createAreaMaskTools } from "@services/creation-requests/models";
import type { ReplicateModelServices } from "@services/creation-requests/models";
import { createReplicateModelClient } from "@clients/replicateModelClient";
import { logger } from "@infrastructure/Logger";

export function registerWorkflowServices(container: DIContainer): void {
  container.register("workflowProjectStore", () => new ProjectStore(getFirestore()), []);
  container.register("workflowFolderStore", () => new FolderStore(getFirestore()), []);
  container.register("workflowConversationStore", (projects: ProjectStore, folders: FolderStore) => new ConversationStore(getFirestore(), projects, undefined, folders), ["workflowProjectStore", "workflowFolderStore"]);
  container.register("workflowDraftStore", (projects: ProjectStore, conversations: ConversationStore) => new CreationDraftStore(getFirestore(), projects, conversations), ["workflowProjectStore", "workflowConversationStore"]);
  container.register("workflowContextService", (projects: ProjectStore) => new CreationContextService(getFirestore(), projects), ["workflowProjectStore"]);
  container.register("workflowHistoryStore", (projects: ProjectStore) => new RequestHistoryStore(getFirestore(), projects), ["workflowProjectStore"]);
  container.register("workflowMediaIndex", (projects: ProjectStore) => new MediaVersionIndex(getFirestore(), projects), ["workflowProjectStore"]);
  container.register("workflowMediaLibrary", (projects: ProjectStore, media: MediaVersionIndex, bucket: Bucket) => new ProjectMediaService(getFirestore(), projects, media, new GcsProjectMediaStorage(bucket)), ["workflowProjectStore", "workflowMediaIndex", "gcsBucket"]);
  container.register("workflowSpendGuard", (config: ServiceConfig) => new StudioWorkflowSpendGuard(getFirestore(), { dailyCapCents: config.studio.dailyCapCents, ...(process.env.WORKFLOW_SPEND_POLICY_JSON ? { policy: WorkflowSpendPolicySchema.parse(JSON.parse(process.env.WORKFLOW_SPEND_POLICY_JSON)) } : {}) }), ["config"]);
  container.register("workflowImageProviders", (schnell: ImagePreviewProvider | null, kontext: ImagePreviewProvider | null) => new Set([schnell, kontext].filter((provider): provider is ImagePreviewProvider => provider !== null).map(provider => provider.id)), ["replicateFluxSchnellProvider", "replicateFluxKontextFastProvider"]);
  container.register("workflowModelServices", (config: ServiceConfig): ReplicateModelServices | null => {
    const client = createReplicateModelClient(config.replicate.apiToken, logger);
    return client ? { runner: new ReplicateModelRunner(client), tools: createAreaMaskTools() } : null;
  }, ["config"]);
  container.register("workflowCapabilityCatalog", (providers: ReadonlySet<string>, videos: VideoGenerationService | null, ai: AIExecutionPort, spendGuard: StudioWorkflowSpendGuard, models: ReplicateModelServices | null) => {
    const text = ai.resolveExecution("studio_turn");
    return new WorkflowCapabilityCatalog(undefined, { spendGuard, imageProviders: providers, videoAvailable: model => videos?.getModelAvailability(model).available === true, textAvailable: ai.getAvailableClients?.().includes(text.client) ?? false, textProvider: text.client, textModel: text.model, replicateAvailable: models !== null });
  }, ["workflowImageProviders", "videoGenerationService", "aiService", "workflowSpendGuard", "workflowModelServices"]);
  container.register("workflowExecutionService", (media: MediaVersionIndex, storage: StorageService, videos: VideoGenerationService | null, ai: AIExecutionPort, providers: ReadonlySet<string>, bucket: Bucket, spendGuard: StudioWorkflowSpendGuard, models: ReplicateModelServices | null) => {
    const executor = new NativeWorkflowExecutor({ videos, ai, spendGuard, imageProviders: providers, models, inputVersion: (ownerId, projectId, versionId) => media.get(ownerId, projectId, versionId), inputAccess: async (ownerId, projectId, versionId) => { const version = await media.get(ownerId, projectId, versionId); if (!version) throw new Error("This selected input is unavailable."); return (await storage.getViewUrl(ownerId, version.object.storagePath)).viewUrl; } });
    return new WorkflowExecutionService(new WorkflowExecutionStore(getFirestore(), media), executor, new GcsWorkflowOutputStorage(bucket, videos));
  }, ["workflowMediaIndex", "storageService", "videoGenerationService", "aiService", "workflowImageProviders", "gcsBucket", "workflowSpendGuard", "workflowModelServices"]);
  container.register("workflowVideoEditStore", (projects: ProjectStore, media: MediaVersionIndex) => new VideoEditStore(getFirestore(), projects, media), ["workflowProjectStore", "workflowMediaIndex"]);
  container.register("workflowExportStorage", (bucket: Bucket) => new GcsExportStorage(bucket), ["gcsBucket"]);
  container.register("workflowVideoRenderer", (storage: GcsExportStorage) => new NativeVideoRenderer(storage), ["workflowExportStorage"]);
  container.register("workflowVideoExportService", (projects: ProjectStore, edits: VideoEditStore, media: MediaVersionIndex, storage: GcsExportStorage, renderer: NativeVideoRenderer) => new VideoExportService(getFirestore(), projects, edits, media, storage, renderer), ["workflowProjectStore", "workflowVideoEditStore", "workflowMediaIndex", "workflowExportStorage", "workflowVideoRenderer"]);
  container.register("workflowVideoPreviewService", (projects: ProjectStore, media: MediaVersionIndex, storage: GcsExportStorage, renderer: NativeVideoRenderer) => new VideoPreviewService(getFirestore(), projects, media, storage, renderer), ["workflowProjectStore", "workflowMediaIndex", "workflowExportStorage", "workflowVideoRenderer"]);
  container.register("workflowAccountUsage", (config: ServiceConfig) => new AccountUsageService(getFirestore(), { studioCapCents: config.studio.dailyCapCents, sketchCapCents: config.fal.sketchDailyCapCents, sketchFrameCostMillicents: config.fal.sketchFrameCostMillicents }), ["config"]);
  container.register("workflowSketchService", (projects: ProjectStore, media: MediaVersionIndex, bucket: Bucket) => new ProjectSketchService(getFirestore(), projects, new GcsProjectSketchStorage(bucket), media), ["workflowProjectStore", "workflowMediaIndex", "gcsBucket"]);
  container.register("workflowManagementService", (projects: ProjectStore, conversations: ConversationStore, media: MediaVersionIndex, bucket: Bucket, storage: GcsExportStorage) => new WorkflowManagementService(getFirestore(), projects, conversations, media, new GcsWorkflowManagementStorage(bucket, storage)), ["workflowProjectStore", "workflowConversationStore", "workflowMediaIndex", "gcsBucket", "workflowExportStorage"]);
  container.register("workflowPreparationService", (projects: ProjectStore, conversations: ConversationStore, drafts: CreationDraftStore, contexts: CreationContextService, profiles: WorkflowCapabilityCatalog, media: MediaVersionIndex) => new ActionPreparationService({ database: getFirestore(), projects, conversations, drafts, contexts, profiles, media }), ["workflowProjectStore", "workflowConversationStore", "workflowDraftStore", "workflowContextService", "workflowCapabilityCatalog", "workflowMediaIndex"]);
  container.register("workflowRequestLifecycle", (preparation: ActionPreparationService, execution: WorkflowExecutionService) => new CreationRequestLifecycle(getFirestore(), preparation, execution), ["workflowPreparationService", "workflowExecutionService"]);
}
