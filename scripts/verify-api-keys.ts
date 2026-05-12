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
 * Main function
 */
async function main() {
  console.log(`${colors.bold}${colors.cyan}
╔════════════════════════════════════════╗
║      API Key Verification Tool         ║
╚════════════════════════════════════════╝
${colors.reset}`);

  const openAIValid = await testOpenAIKey();
  const groqValid = await testGroqKey();

  await testResponseTimes();

  log.header("Summary");

  if (openAIValid && groqValid) {
    log.success("All API keys are valid and working! ✨");
    log.info(
      "Prompt optimization can use both OpenAI and Groq-backed services.",
    );
  } else if (openAIValid && !groqValid) {
    log.warning("OpenAI key is valid but Groq key is missing or invalid.");
    log.info(
      "The app will work, but Groq-backed prompt optimization features will be unavailable.",
    );
  } else if (!openAIValid) {
    log.error("OpenAI API key is invalid - the application will not function!");
    log.info("Please update OPENAI_API_KEY in your .env file.");
  }

  console.log("");
  process.exit(openAIValid ? 0 : 1);
}

// Run the script
main().catch((error) => {
  console.error("Script error:", error);
  process.exit(1);
});
