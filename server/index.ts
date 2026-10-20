/**
 * Server Entry Point
 *
 * Minimal orchestration that:
 * 1. Validates environment
 * 2. Configures dependency injection
 * 3. Initializes services
 * 4. Creates Express app
 * 5. Starts server
 * 6. Sets up graceful shutdown
 *
 * All business logic is delegated to specialized modules.
 */

// Load .env before native-fonts reads PANGOCAIRO_BACKEND.
import "dotenv/config";
import "./src/config/native-fonts.js";

import { existsSync, readdirSync } from "node:fs";
import { parseEnv, emitEnvWarnings } from "@config/env";
import { logger } from "@infrastructure/Logger";
import { configureServices, initializeServices } from "@config/services.config";
import { NEURO_SYMBOLIC } from "@llm/span-labeling/config/SpanLabelingConfig";
import { modelDirPath, modelPath } from "@llm/span-labeling/nlp/paths";
import { createApp } from "./src/app.js";
import { startServer, setupGracefulShutdown } from "./src/server.js";

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

function assertSpanLabelingModelsPresent(): void {
  const inTestMode =
    process.env.NODE_ENV === "test" ||
    process.env.VITEST ||
    process.env.VITEST_WORKER_ID;
  const shouldCheck =
    !inTestMode &&
    NEURO_SYMBOLIC.ENABLED &&
    Boolean(NEURO_SYMBOLIC.GLINER?.ENABLED);

  if (!shouldCheck) {
    return;
  }

  const hasModelFile = existsSync(modelPath);
  const hasModelDirectory = existsSync(modelDirPath);
  const hasAnyModelAssets =
    hasModelDirectory && readdirSync(modelDirPath).length > 0;

  if (hasModelFile && hasAnyModelAssets) {
    return;
  }

  throw new Error(
    `Span-labeling model assets are missing in server/src/llm/span-labeling/nlp/models/. Run: npm run download-models`,
  );
}

/**
 * Bootstrap the application
 */
async function bootstrap() {
  try {
    // ========================================================================
    // 1. Validate Environment
    // ========================================================================
    logger.info("Validating environment variables...");
    const validatedEnv = parseEnv();
    emitEnvWarnings(validatedEnv);
    logger.info("✅ Environment variables validated successfully");
    assertSpanLabelingModelsPresent();

    // ========================================================================
    // 2. Configure Dependency Injection Container
    // ========================================================================
    logger.info("Configuring dependency injection container...");
    const container = await configureServices();
    logger.info("✅ DI container configured with all service definitions");

    // ========================================================================
    // 3. Initialize and Validate Services
    // ========================================================================
    logger.info("Initializing services...");
    await initializeServices(container);
    logger.info("✅ All services initialized and validated");

    // ========================================================================
    // 4. Create Express Application
    // ========================================================================
    logger.info("Creating Express application...");
    const app = createApp(container);
    logger.info("✅ Express app created with middleware and routes");

    // ========================================================================
    // 5. Start HTTP Server
    // ========================================================================
    logger.info("Starting HTTP server...");
    const server = await startServer(app, container);
    logger.info("✅ Server started successfully");

    // ========================================================================
    // 6. Setup Graceful Shutdown
    // ========================================================================
    setupGracefulShutdown(server, container);
    logger.info("✅ Graceful shutdown handlers registered");

    return { app, server, container };
  } catch (error) {
    const caughtError = toError(error);
    logger.error("❌ Application bootstrap failed", caughtError);
    console.error("\n❌ FATAL: Application failed to start");
    console.error(caughtError.message);

    // Throw error instead of process.exit to allow parent processes to handle
    throw caughtError;
  }
}

// ============================================================================
// Application Initialization
// ============================================================================

// When running under vitest, initialize the app synchronously without
// binding a port — unit tests import `appInstance` for in-process testing.
// E2E (Playwright) sets NODE_ENV=test to skip the Firebase startup probe in
// services.initialize.ts, but still needs the server to listen on its port,
// so NODE_ENV alone must NOT short-circuit bootstrap here.
const isTestEnv =
  Boolean(process.env.VITEST) || Boolean(process.env.VITEST_WORKER_ID);

let appInstance = null;
let containerInstance = null;

if (isTestEnv) {
  // Test mode: Initialize services but don't start server
  // Use top-level await (supported in ES modules)
  try {
    logger.info("Initializing application in test mode...");
    containerInstance = await configureServices();
    await initializeServices(containerInstance);
    appInstance = createApp(containerInstance);
    logger.info("Application initialized successfully for testing");
  } catch (error) {
    const caughtError = toError(error);
    logger.error("Failed to initialize app in test mode", caughtError);
    console.error("Test initialization failed:", caughtError);
    throw caughtError;
  }
} else {
  // Production mode: Full bootstrap with server startup
  bootstrap().catch((error) => {
    console.error("Fatal error during bootstrap:", error);
    process.exit(1);
  });
}

// ============================================================================
// Exports
// ============================================================================

// Export app for testing (default export for backward compatibility)
export default appInstance;

// Export bootstrap function and instances for programmatic use
export { bootstrap, appInstance, containerInstance };
