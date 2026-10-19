import "../../../server/src/config/native-fonts.js";
import { createServer } from "vite";
import { resolve } from "node:path";
import { startCrossModeHarness } from "#tests/integration/helpers/cross-mode/harness";
import { createWorkflowTestDatabase } from "#tests/integration/helpers/workflow/emulator";
import { parseBrowserAddress } from "../cross-mode/browserAddress";
import { BrowserBoundaries } from "./browserBoundaries";

const address = parseBrowserAddress(process.env.CROSS_MODE_BROWSER_URL ?? "http://127.0.0.1:58341");
process.env.GCS_BUCKET_NAME = "prompt-builder-test-bucket";
process.env.ALLOWED_ORIGINS = address.origin;
process.env.FRONTEND_URL = address.origin;
process.env.VITE_FIREBASE_API_KEY = "synthetic-firebase-key";
process.env.VITE_FIREBASE_PROJECT_ID = "demo-workflow-browser";
process.env.VIDEO_JOB_WORKER_ENABLED = "false";
process.env.VIDEO_JOB_INLINE_ENABLED = "false";
const database = createWorkflowTestDatabase();
const boundaries = new BrowserBoundaries(address.origin);
await boundaries.initialize();
const foreign = { projectId: "project_foreign_browser", conversationId: "conversation_foreign_browser" };
const harness = await startCrossModeHarness({
  async configureBoundaries({ container, storage }): Promise<void> {
    const { ProjectStore } = await import("@services/projects/ProjectStore");
    const { ConversationStore } = await import("@services/projects/ConversationStore");
    const { FolderStore } = await import("@services/projects/FolderStore");
    const { CreationDraftStore } = await import("@services/creation-drafts/CreationDraftStore");
    const { CreationContextService } = await import("@services/creation-context/CreationContextService");
    const { RequestHistoryStore } = await import("@services/media-history/RequestHistoryStore");
    const { MediaVersionIndex } = await import("@services/media-history/MediaVersionIndex");
    const { ActionPreparationService } = await import("@services/creation-requests/preparation/ActionPreparationService");
    const { WorkflowCapabilityCatalog } = await import("@services/creation-requests/preparation/WorkflowCapabilityCatalog");
    const { RequestIdempotencyService } = await import("@services/admission/idempotency/RequestIdempotencyService");
    const { FirestoreCircuitExecutor } = await import("@services/firestore/FirestoreCircuitExecutor");
    const { WorkflowExecutionStore } = await import("@services/creation-requests/execution/WorkflowExecutionStore");
    const { WorkflowExecutionService } = await import("@services/creation-requests/execution/WorkflowExecutionService");
    const { NativeWorkflowExecutor } = await import("@services/creation-requests/execution/NativeWorkflowExecutor");
    const { StudioWorkflowSpendGuard } = await import("@services/creation-requests/execution/StudioWorkflowSpendGuard");
    const { ProjectMediaService } = await import("@services/project-media/ProjectMediaService");
    const { VideoEditStore } = await import("@services/video-editing/VideoEditStore");
    const { NativeVideoRenderer } = await import("@services/video-export/NativeVideoRenderer");
    const { VideoExportService } = await import("@services/video-export/VideoExportService");
    const { VideoPreviewService } = await import("@services/video-editing/VideoPreviewService");
    const { ProjectSketchService } = await import("@services/project-sketch/ProjectSketchService");
    const { WorkflowManagementService } = await import("@services/workflow-sharing/WorkflowManagementService");
    const { AccountUsageService } = await import("@services/account/AccountUsageService");
    const projects = new ProjectStore(database);
    const folders = new FolderStore(database);
    const conversations = new ConversationStore(database, projects, undefined, folders);
    const drafts = new CreationDraftStore(database, projects, conversations);
    const contexts = new CreationContextService(database, projects);
    const media = new MediaVersionIndex(database, projects);
    const spendGuard = new StudioWorkflowSpendGuard(database, { dailyCapCents: 500 });
    const profiles = new WorkflowCapabilityCatalog(undefined, { imageProviders: new Set(["replicate-flux-schnell", "replicate-flux-kontext-fast"]), videoAvailable: model => model === "wan-video/wan-2.2-t2v-fast", textAvailable: true, textProvider: "openai", textModel: "controlled-browser-text", spendGuard });
    const originalAccess = storage.getViewUrl.bind(storage);
    storage.getViewUrl = async (owner, path) => {
      if (!boundaries.objects.has(path)) return originalAccess(owner, path);
      const grant = await boundaries.access(owner, path);
      return { viewUrl: grant.url, expiresAt: grant.expiresAt, storagePath: path };
    };
    const dependencies = boundaries.nativeDependencies(async (owner, project, version) => {
      const source = await media.get(owner, project, version); if (!source) throw new Error("Selected media unavailable");
      return (await boundaries.access(owner, source.object.storagePath)).url;
    });
    dependencies.spendGuard = spendGuard;
    const native = new NativeWorkflowExecutor(dependencies);
    const execution = new WorkflowExecutionService(new WorkflowExecutionStore(database, media), {
      available: profile => native.available(profile),
      execute: async (request, slot, profile, words) => { const output = await native.execute(request, slot, profile, words); if (output.kind === "video") boundaries.bindVideoAsset(request.ownerId, output.assetId); return output; },
    }, boundaries.outputStorage);
    const edits = new VideoEditStore(database, projects, media);
    const renderer = new NativeVideoRenderer(boundaries.exportStorage);
    container.registerValue("workflowProjectStore", projects);
    container.registerValue("workflowFolderStore", folders);
    container.registerValue("workflowConversationStore", conversations);
    container.registerValue("workflowDraftStore", drafts);
    container.registerValue("workflowContextService", contexts);
    container.registerValue("workflowHistoryStore", new RequestHistoryStore(database, projects));
    container.registerValue("workflowMediaIndex", media);
    container.registerValue("workflowMediaLibrary", new ProjectMediaService(database, projects, media, boundaries.mediaStorage));
    container.registerValue("workflowCapabilityCatalog", profiles);
    container.registerValue("workflowPreparationService", new ActionPreparationService({ database, projects, conversations, drafts, contexts, profiles, media }));
    container.registerValue("requestIdempotencyService", new RequestIdempotencyService(new FirestoreCircuitExecutor({ timeoutMs: 20000 }), { database }));
    container.registerValue("workflowExecutionService", execution);
    container.registerValue("workflowSpendGuard", spendGuard);
    container.registerValue("workflowVideoEditStore", edits);
    container.registerValue("workflowExportStorage", boundaries.exportStorage);
    container.registerValue("workflowVideoRenderer", renderer);
    container.registerValue("workflowVideoExportService", new VideoExportService(database, projects, edits, media, boundaries.exportStorage, renderer));
    container.registerValue("workflowVideoPreviewService", new VideoPreviewService(database, projects, media, boundaries.exportStorage, renderer));
    container.registerValue("workflowSketchService", new ProjectSketchService(database, projects, boundaries.sketchStorage, media));
    container.registerValue("sketchRelayFetch", boundaries.sketchPreview);
    container.registerValue("workflowManagementService", new WorkflowManagementService(database, projects, conversations, media, boundaries.managementStorage));
    container.registerValue("workflowAccountUsage", new AccountUsageService(database, { studioCapCents: 500, sketchCapCents: 500, sketchFrameCostMillicents: 250 }));
    await projects.create("foreign-browser-owner", { id: foreign.projectId, name: "Foreign private project sentinel" });
    await conversations.create("foreign-browser-owner", foreign.projectId, { id: foreign.conversationId, name: "Foreign private conversation sentinel" });
  },
});
const vite = await createServer({
  configFile: "config/build/vite.config.ts",
  cacheDir: resolve("node_modules/.cache/workflow-browser", String(address.port)),
  plugins: [{ name: "workflow-proof-state", configureServer(server): void {
    server.middlewares.use((req, res, next) => {
      if (req.url?.startsWith("/__test/state")) {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ outbound: harness.guard.violations, providerCalls: boundaries.providerCalls, foreign, evidence: { providers: "deterministic local doubles", storage: "immutable byte/hash/generation checked memory adapter", database: "isolated Firestore emulator", renderer: "real NativeVideoRenderer with local FFmpeg" } }));
        return;
      }
      void boundaries.middleware(req, res, next).catch(error => { res.statusCode = 500; res.end(error instanceof Error ? error.message : "Test boundary failed"); });
    });
  } }],
  server: { host: "127.0.0.1", port: address.port, strictPort: true, proxy: { "/api": { target: harness.baseUrl, changeOrigin: true }, "/health": { target: harness.baseUrl } } },
});
await vite.listen();
vite.printUrls();
const stop = async (): Promise<void> => { await vite.close(); await harness.close(); await database.terminate(); process.exit(0); };
process.once("SIGINT", () => { void stop(); });
process.once("SIGTERM", () => { void stop(); });
