#!/usr/bin/env node

/**
 * API Key Verification Script
 *
 * Tests all configured API keys and reports their status.
 * Run with: npm run verify-keys
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { resolveFalApiKey } from "../server/src/utils/falApiKey.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, "..", ".env") });

// Colors for terminal output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

type LogMeta = Record<string, unknown>;

const logWithMeta = (prefix: string, msg: string, meta?: LogMeta) => {
  if (meta) {
    console.log(prefix, msg, meta);
  } else {
    console.log(prefix, msg);
  }
};

const log = {
  success: (msg: string, meta?: LogMeta) =>
    logWithMeta(`${colors.green}✓${colors.reset}`, msg, meta),
  error: (msg: string, meta?: LogMeta) =>
    logWithMeta(`${colors.red}✗${colors.reset}`, msg, meta),
  warning: (msg: string, meta?: LogMeta) =>
    logWithMeta(`${colors.yellow}⚠${colors.reset}`, msg, meta),
  info: (msg: string, meta?: LogMeta) =>
    logWithMeta(`${colors.cyan}ℹ${colors.reset}`, msg, meta),
  header: (msg: string) => console.log(`\n${colors.bold}${msg}${colors.reset}`),
};

/**
 * Test OpenAI API Key
 */
async function testOpenAIKey() {
  log.header("Testing OpenAI API Key...");

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    log.error("OPENAI_API_KEY is not set in .env file");
    return false;
  }

  log.info("API key loaded", {
    keyPrefix: apiKey.substring(0, 7),
    keySuffix: apiKey.substring(apiKey.length - 4),
  });

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      const data = (await response.json()) as { data: Array<{ id: string }> };
      log.success("OpenAI API key is valid", { modelCount: data.data.length });

      // Check if the configured model is available
      const configuredModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
      const modelAvailable = data.data.some((m) => m.id === configuredModel);

      if (modelAvailable) {
        log.success("Configured model is available", { configuredModel });
      } else {
        log.warning("Configured model not found", {
          configuredModel,
          modelFamily: "gpt",
        });
        data.data
          .filter((m) => m.id.startsWith("gpt"))
          .forEach((m) => log.info("Available model", { modelId: m.id }));
      }

      return true;
    } else {
      const error = await response.text();
      log.error("OpenAI API key is invalid", {
        status: response.status,
        error,
      });
      return false;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error("Failed to test OpenAI API key", { error: errorMessage });
    return false;
  }
}

/**
 * Test Groq API Key
 */
async function testGroqKey() {
  log.header("Testing Groq API Key...");

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    log.warning(
      "GROQ_API_KEY is not set in .env file (Groq-backed prompt optimization unavailable)",
    );
    return false;
  }

  log.info("API key loaded", {
    keyPrefix: apiKey.substring(0, 7),
    keySuffix: apiKey.substring(apiKey.length - 4),
  });

  try {
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      const data = (await response.json()) as { data: Array<{ id: string }> };
      log.success("Groq API key is valid", { modelCount: data.data.length });

      // Check if the configured model is available
      const configuredModel = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
      const modelAvailable = data.data.some((m) => m.id === configuredModel);

      if (modelAvailable) {
        log.success("Configured model is available", { configuredModel });
      } else {
        log.warning("Configured model not found", {
          configuredModel,
          modelFamily: "llama",
        });
        data.data
          .filter((m) => m.id.includes("llama"))
          .forEach((m) => log.info("Available model", { modelId: m.id }));
      }

      return true;
    } else {
      const errorText = await response.text();
      let errorMessage = errorText;

      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {
        // Use original text if not JSON
      }

      log.error("Groq API key is invalid", {
        status: response.status,
        error: errorMessage,
      });

      if (response.status === 401) {
        log.info("To get a new Groq API key:");
        log.info("  1. Visit https://console.groq.com");
        log.info("  2. Sign in or create an account");
        log.info("  3. Navigate to API Keys section");
        log.info("  4. Create a new key and update GROQ_API_KEY in .env");
      }

      return false;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error("Failed to test Groq API key", { error: errorMessage });
    return false;
  }
}

/**
 * Test API response times
 */
async function testResponseTimes() {
  log.header("Testing API Response Times...");

  // Test OpenAI response time
  const openAIKey = process.env.OPENAI_API_KEY;
  if (openAIKey) {
    const startTime = Date.now();
    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openAIKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            messages: [
              { role: "system", content: 'Respond with just the word "test"' },
              { role: "user", content: "Test" },
            ],
            max_tokens: 10,
          }),
        },
      );

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        log.success("OpenAI API response time", {
          responseTimeMs: responseTime,
        });
      } else {
        log.warning("OpenAI API test failed", { status: response.status });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      log.error("OpenAI response time test failed", { error: errorMessage });
    }
  }

  // Test Groq response time
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    const startTime = Date.now();
    try {
      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${groqKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
            messages: [
              { role: "system", content: 'Respond with just the word "test"' },
              { role: "user", content: "Test" },
            ],
            max_tokens: 10,
          }),
        },
      );

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        log.success("Groq API response time", { responseTimeMs: responseTime });
        if (responseTime < 500) {
          log.success(
            "Groq is performing excellently for fast draft generation!",
          );
        }
      } else {
        log.warning("Groq API test failed", { status: response.status });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      log.error("Groq response time test failed", { error: errorMessage });
    }
  }
}


/**
 * Test Gemini API Key (GEMINI_API_KEY, falling back to GOOGLE_API_KEY —
 * the same resolution order as server/src/config/env.ts).
 */
async function testGeminiKey(): Promise<boolean> {
  log.header("Testing Gemini API Key...");
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    log.error("Neither GEMINI_API_KEY nor GOOGLE_API_KEY is set in .env");
    return false;
  }
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=1`,
    );
    if (response.ok) {
      log.success("Gemini API key is valid");
      return true;
    }
    log.error("Gemini API key rejected", { status: response.status });
    return false;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error("Failed to test Gemini API key", { error: errorMessage });
    return false;
  }
}

/**
 * Test Replicate API token (image generation: Flux Schnell/Kontext, studio).
 */
async function testReplicateToken(): Promise<boolean> {
  log.header("Testing Replicate API Token...");
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    log.error("REPLICATE_API_TOKEN is not set in .env");
    return false;
  }
  try {
    const response = await fetch("https://api.replicate.com/v1/account", {
      headers: { Authorization: `Token ${token}` },
    });
    if (response.ok) {
      const account = (await response.json()) as { username?: string };
      log.success("Replicate token is valid", {
        username: account.username ?? "unknown",
      });
      return true;
    }
    log.error("Replicate token rejected", { status: response.status });
    return false;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error("Failed to test Replicate token", { error: errorMessage });
    return false;
  }
}

/**
 * Test fal key AND account standing. fal signals an exhausted balance as a
 * 403 "User is locked. Reason: Exhausted balance." on every call — a lockout
 * that once cost a day of debugging because it looked like a silent editor
 * (see fal-i2i relay history). A cheap status probe distinguishes bad key
 * (401) from locked account (403) from healthy (any other response).
 */
async function testFalKey(): Promise<boolean> {
  log.header("Testing fal Key + balance...");
  // resolveFalApiKey handles the `${FAL_KEY_ID}:${FAL_KEY_SECRET}` template
  // form dotenv leaves unexpanded (the server has the same guard).
  const key = resolveFalApiKey();
  if (!key) {
    log.error("FAL_KEY (or FAL_KEY_ID/FAL_KEY_SECRET) is not set in .env");
    return false;
  }
  try {
    const response = await fetch(
      "https://queue.fal.run/fal-ai/z-image/requests/00000000-0000-0000-0000-000000000000/status",
      { headers: { Authorization: `Key ${key}` } },
    );
    if (response.status === 401) {
      log.error("fal key rejected (401)");
      return false;
    }
    const body = await response.text();
    if (response.status === 403 && body.includes("Exhausted balance")) {
      log.error(
        "fal key is VALID but the account balance is EXHAUSTED — the live editor will silently fail",
      );
      return false;
    }
    log.success("fal key accepted and account is in good standing", {
      probeStatus: response.status,
    });
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error("Failed to test fal key", { error: errorMessage });
    return false;
  }
}

/**
 * Test Luma API key (LUMA_API_KEY, falling back to LUMAAI_API_KEY).
 */
async function testLumaKey(): Promise<boolean> {
  log.header("Testing Luma API Key...");
  const apiKey = process.env.LUMA_API_KEY || process.env.LUMAAI_API_KEY;
  if (!apiKey) {
    log.error("Neither LUMA_API_KEY nor LUMAAI_API_KEY is set in .env");
    return false;
  }
  try {
    const response = await fetch(
      "https://api.lumalabs.ai/dream-machine/v1/generations?limit=1",
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    if (response.ok) {
      log.success("Luma API key is valid");
      return true;
    }
    log.error("Luma API key rejected", { status: response.status });
    return false;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error("Failed to test Luma API key", { error: errorMessage });
    return false;
  }
}

/**
 * Kling authenticates with per-request signed JWTs built from the key —
 * there is no cheap validity probe, so this is a presence check only.
 */
function testKlingKeyPresence(): boolean {
  log.header("Checking Kling API Key (presence only)...");
  if (!process.env.KLING_API_KEY) {
    log.warning(
      "KLING_API_KEY is not set — Kling renders will fail if selected",
    );
    return false;
  }
  log.info(
    "KLING_API_KEY is present (validity is proven on first render — Kling uses signed JWTs)",
  );
  return true;
}

/**
 * Main function
 */
async function main() {
  console.log(`${colors.bold}${colors.cyan}
╔════════════════════════════════════════╗
║      API Key Verification Tool         ║
╚════════════════════════════════════════╝
${colors.reset}`);

  const results: Array<[string, boolean]> = [
    ["OpenAI", await testOpenAIKey()],
    ["Groq", await testGroqKey()],
    ["Gemini", await testGeminiKey()],
    ["Replicate", await testReplicateToken()],
    ["fal", await testFalKey()],
    ["Luma", await testLumaKey()],
    ["Kling (presence)", testKlingKeyPresence()],
  ];

  await testResponseTimes();

  log.header("Summary");
  const failed = results.filter(([, ok]) => !ok).map(([name]) => name);
  if (failed.length === 0) {
    log.success("All provider credentials are valid and working! ✨");
  } else {
    log.warning(`Providers with missing/invalid credentials: ${failed.join(", ")}`);
    log.info(
      "Surfaces routed to those providers will fail — the LLM failover chain covers OpenAI/Groq/Gemini, but image (Replicate), the live editor (fal), and renders (Luma/Kling) have no fallback.",
    );
  }

  console.log("");
  // Exit code keys on the text-model spine (OpenAI or a failover provider):
  // without any of those, the authoring loop cannot run at all.
  const spineOk = results
    .filter(([name]) => ["OpenAI", "Groq", "Gemini"].includes(name))
    .some(([, ok]) => ok);
  process.exit(spineOk ? 0 : 1);
}

// Run the script
main().catch((error) => {
  console.error("Script error:", error);
  process.exit(1);
});
