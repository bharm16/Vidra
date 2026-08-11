/**
 * Property Tests: TypeScript Configuration
 *
 * Feature: typescript-config-fixes
 *
 * Property 2: No Deep Relative Imports
 * Validates: Requirements 1.9, 8.1, 8.2, 8.4
 *
 * Property 3: Configuration Correctness
 * Validates: Requirements 1.1, 1.2, 1.6-1.10, 2.7, 3.2, 3.3, 6.3
 *
 * These property tests verify that the TypeScript configuration is correct
 * and that imports follow the project's conventions.
 *
 * Property 1 ("zero compilation errors") used to live here and shelled out to
 * `tsc` three times — root, client, and server. It cost 55s of a 56s server
 * suite, four times the next slowest file, and the root run duplicated
 * `verify`'s own first gate verbatim. Compiling is a gate, not a unit test:
 * all three now run in `scripts/typecheck.sh`, concurrently and incrementally.
 * The client config adds nothing the root config does not already check (it
 * extends root, narrows nothing, and its extra `vite.config.ts` entry does not
 * exist), so that one is simply gone; the server config narrows `lib` to
 * ES2022 with `types: ["node"]`, which is the only check that catches server
 * code reaching for a DOM global, and it is kept.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * Deep import baseline (stabilization branch, updated 2026-04-19).
 * These checks enforce no regressions while cleanup is incrementally completed.
 * Bump the ceiling only when a refactor legitimately adds one — the goal
 * remains to drive these numbers down over time.
 */
const DEEP_IMPORT_BASELINE = {
  server: 39,
  client: 49,
} as const;

/**
 * Parse JSON with comments (JSONC) by stripping comments
 * @param content - JSONC content string
 * @returns Parsed JSON object
 */
function parseJsonc(content: string): Record<string, unknown> {
  // Remove single-line comments (// ...) but not inside strings
  // This regex handles comments that are not inside quoted strings
  let result = "";
  let inString = false;
  let stringChar = "";
  let i = 0;

  while (i < content.length) {
    const char = content[i];
    const nextChar = content[i + 1];

    // Handle string boundaries
    if (
      (char === '"' || char === "'") &&
      (i === 0 || content[i - 1] !== "\\")
    ) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      result += char;
      i++;
      continue;
    }

    // Skip single-line comments when not in string
    if (!inString && char === "/" && nextChar === "/") {
      // Skip until end of line
      while (i < content.length && content[i] !== "\n") {
        i++;
      }
      continue;
    }

    // Skip multi-line comments when not in string
    if (!inString && char === "/" && nextChar === "*") {
      i += 2; // Skip /*
      while (
        i < content.length - 1 &&
        !(content[i] === "*" && content[i + 1] === "/")
      ) {
        i++;
      }
      i += 2; // Skip */
      continue;
    }

    result += char;
    i++;
  }

  // Remove trailing commas before closing brackets/braces
  const withoutTrailingCommas = result.replace(/,(\s*[}\]])/g, "$1");

  return JSON.parse(withoutTrailingCommas);
}

/**
 * Recursively get all TypeScript files in a directory
 * @param dir - Directory to scan
 * @param files - Accumulated files array
 * @returns Array of TypeScript file paths
 */
function getAllTypeScriptFiles(dir: string, files: string[] = []): string[] {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);

    // Skip node_modules, dist, and hidden directories
    if (
      entry === "node_modules" ||
      entry === "dist" ||
      entry.startsWith(".") ||
      entry === "coverage"
    ) {
      continue;
    }

    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      getAllTypeScriptFiles(fullPath, files);
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      // Skip declaration files (.d.ts)
      if (!entry.endsWith(".d.ts")) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

describe("TypeScript Configuration - Property Tests", () => {
  /**
   * Property 2: No Deep Relative Imports
   *
   * Feature: typescript-config-fixes, Property 2: No Deep Relative Imports
   * Validates: Requirements 1.9, 8.1, 8.2, 8.4
   *
   * For any TypeScript file in the project, there SHALL be no import statements
   * containing `../../` (traversing more than one directory level).
   *
   * This property ensures that all cross-module imports use path aliases
   * instead of deep relative imports, making the codebase more maintainable
   * and refactoring-safe.
   */
  describe("Property 2: No Deep Relative Imports", () => {
    it("should have no deep relative imports in server code", () => {
      const serverFiles = getAllTypeScriptFiles("server/src");
      const violations: { file: string; imports: string[] }[] = [];

      for (const file of serverFiles) {
        const content = readFileSync(file, "utf-8");

        // Match import statements with deep relative paths (../../ or deeper)
        // This regex matches: import ... from '../../...' or import ... from "../../..."
        const deepImportPattern =
          /(?:import|export)\s+(?:[\s\S]*?)\s+from\s+['"](\.\.[\/\\]\.\.[\s\S]*?)['"]/g;
        const matches: string[] = [];
        let match;

        while ((match = deepImportPattern.exec(content)) !== null) {
          if (match[1]) {
            matches.push(match[1]);
          }
        }

        if (matches.length > 0) {
          violations.push({ file, imports: matches });
        }
      }

      if (violations.length > 0) {
        console.error("Deep relative imports found in server code:");
        violations.forEach(({ file, imports }) => {
          console.error(`  ${file}:`);
          imports.forEach((imp) => console.error(`    - ${imp}`));
        });
      }

      expect(
        violations.length,
        `Expected server deep relative imports <= ${DEEP_IMPORT_BASELINE.server}, found ${violations.length}`,
      ).toBeLessThanOrEqual(DEEP_IMPORT_BASELINE.server);
    });

    it("should have no deep relative imports in client code", () => {
      const clientFiles = getAllTypeScriptFiles("client/src");
      const violations: { file: string; imports: string[] }[] = [];

      for (const file of clientFiles) {
        const content = readFileSync(file, "utf-8");

        // Match import statements with deep relative paths (../../ or deeper)
        const deepImportPattern =
          /(?:import|export)\s+(?:[\s\S]*?)\s+from\s+['"](\.\.[\/\\]\.\.[\s\S]*?)['"]/g;
        const matches: string[] = [];
        let match;

        while ((match = deepImportPattern.exec(content)) !== null) {
          if (match[1]) {
            matches.push(match[1]);
          }
        }

        if (matches.length > 0) {
          violations.push({ file, imports: matches });
        }
      }

      if (violations.length > 0) {
        console.error("Deep relative imports found in client code:");
        violations.forEach(({ file, imports }) => {
          console.error(`  ${file}:`);
          imports.forEach((imp) => console.error(`    - ${imp}`));
        });
      }

      expect(
        violations.length,
        `Expected client deep relative imports <= ${DEEP_IMPORT_BASELINE.client}, found ${violations.length}`,
      ).toBeLessThanOrEqual(DEEP_IMPORT_BASELINE.client);
    });

    it("should have no deep relative imports in test files", () => {
      const testFiles = getAllTypeScriptFiles("tests");
      const violations: { file: string; imports: string[] }[] = [];

      for (const file of testFiles) {
        // Skip this test file itself to avoid self-detection of the regex pattern
        if (file.includes("typescript-config.test.ts")) {
          continue;
        }

        const content = readFileSync(file, "utf-8");

        // Match import statements with deep relative paths (../../ or deeper)
        const deepImportPattern =
          /(?:import|export)\s+(?:[\s\S]*?)\s+from\s+['"](\.\.[\/\\]\.\.[\s\S]*?)['"]/g;
        const matches: string[] = [];
        let match;

        while ((match = deepImportPattern.exec(content)) !== null) {
          if (match[1]) {
            matches.push(match[1]);
          }
        }

        if (matches.length > 0) {
          violations.push({ file, imports: matches });
        }
      }

      if (violations.length > 0) {
        console.error("Deep relative imports found in test files:");
        violations.forEach(({ file, imports }) => {
          console.error(`  ${file}:`);
          imports.forEach((imp) => console.error(`    - ${imp}`));
        });
      }

      expect(
        violations.length,
        `Expected no deep relative imports, but found ${violations.length} files with violations`,
      ).toBe(0);
    });

    it("should have no deep relative imports in shared code", () => {
      const sharedFiles = getAllTypeScriptFiles("shared");
      const violations: { file: string; imports: string[] }[] = [];

      for (const file of sharedFiles) {
        const content = readFileSync(file, "utf-8");

        // Match import statements with deep relative paths (../../ or deeper)
        const deepImportPattern =
          /(?:import|export)\s+(?:[\s\S]*?)\s+from\s+['"](\.\.[\/\\]\.\.[\s\S]*?)['"]/g;
        const matches: string[] = [];
        let match;

        while ((match = deepImportPattern.exec(content)) !== null) {
          if (match[1]) {
            matches.push(match[1]);
          }
        }

        if (matches.length > 0) {
          violations.push({ file, imports: matches });
        }
      }

      if (violations.length > 0) {
        console.error("Deep relative imports found in shared code:");
        violations.forEach(({ file, imports }) => {
          console.error(`  ${file}:`);
          imports.forEach((imp) => console.error(`    - ${imp}`));
        });
      }

      expect(
        violations.length,
        `Expected no deep relative imports, but found ${violations.length} files with violations`,
      ).toBe(0);
    });
  });

  /**
   * Property 3: Configuration Correctness
   *
   * Feature: typescript-config-fixes, Property 3: Configuration Correctness
   * Validates: Requirements 1.1, 1.2, 1.6-1.10, 2.7, 3.2, 3.3, 6.3
   *
   * For any path alias defined in tsconfig.json, the alias SHALL resolve to a valid
   * directory path, and the vitest.config.js SHALL contain matching alias configurations.
   *
   * This property ensures that TypeScript configuration is correct and consistent
   * across all configuration files.
   */
  describe("Property 3: Configuration Correctness", () => {
    /**
     * Test 3.1: Server tsconfig.json required path aliases resolve to valid directories
     * Validates: Requirement 1.1
     *
     * Note: Only checks required aliases from the requirements document.
     * Additional aliases may be defined for future use.
     */
    it("should have server path aliases that resolve to valid directories", () => {
      const serverTsconfig = parseJsonc(
        readFileSync("server/tsconfig.json", "utf-8"),
      );
      const compilerOptions = serverTsconfig.compilerOptions as Record<
        string,
        unknown
      >;
      const paths = compilerOptions.paths as Record<string, string[]>;

      // Required server aliases from Requirements 1.1
      const requiredServerAliases = [
        "@infrastructure/*",
        "@services/*",
        "@interfaces/*",
        "@types/*",
        "@utils/*",
        "@config/*",
        "@llm/*",
        "@middleware/*",
        "@routes/*",
        "@clients/*",
        "@shared/*",
        "#shared/*",
      ];

      const invalidAliases: { alias: string; path: string }[] = [];

      for (const alias of requiredServerAliases) {
        const targetPaths = paths[alias];
        if (!targetPaths) {
          invalidAliases.push({ alias, path: "NOT DEFINED" });
          continue;
        }

        for (const targetPath of targetPaths) {
          // Remove wildcard suffix for directory check
          const dirPath = targetPath.replace("/*", "").replace("*", "");
          const fullPath = join("server", dirPath);

          // Check if the directory exists
          if (!existsSync(fullPath)) {
            invalidAliases.push({ alias, path: fullPath });
          }
        }
      }

      if (invalidAliases.length > 0) {
        console.error(
          "Invalid server path aliases (directories do not exist):",
        );
        invalidAliases.forEach(({ alias, path }) => {
          console.error(`  ${alias} -> ${path}`);
        });
      }

      expect(
        invalidAliases.length,
        `Expected all required server path aliases to resolve to valid directories, but found ${invalidAliases.length} invalid`,
      ).toBe(0);
    });

    /**
     * Test 3.2: Client tsconfig.json path aliases resolve to valid directories
     * Validates: Requirement 1.2
     */
    it("should have client path aliases that resolve to valid directories", () => {
      const clientTsconfig = parseJsonc(
        readFileSync("client/tsconfig.json", "utf-8"),
      );
      const compilerOptions = clientTsconfig.compilerOptions as Record<
        string,
        unknown
      >;
      const paths = compilerOptions.paths as Record<string, string[]>;

      const invalidAliases: { alias: string; path: string }[] = [];

      for (const [alias, targetPaths] of Object.entries(paths)) {
        for (const targetPath of targetPaths) {
          // Remove wildcard suffix for directory check
          const dirPath = targetPath.replace("/*", "").replace("*", "");
          const fullPath = join("client", dirPath);

          // Check if the directory exists
          if (!existsSync(fullPath)) {
            invalidAliases.push({ alias, path: fullPath });
          }
        }
      }

      if (invalidAliases.length > 0) {
        console.error(
          "Invalid client path aliases (directories do not exist):",
        );
        invalidAliases.forEach(({ alias, path }) => {
          console.error(`  ${alias} -> ${path}`);
        });
      }

      expect(
        invalidAliases.length,
        `Expected all client path aliases to resolve to valid directories, but found ${invalidAliases.length} invalid`,
      ).toBe(0);
    });

    /**
     * Test 3.3: Shared path aliases are configured in both client and server
     * Validates: Requirement 1.6
     */
    it("should have shared path aliases configured in both client and server tsconfig", () => {
      const serverTsconfig = parseJsonc(
        readFileSync("server/tsconfig.json", "utf-8"),
      );
      const clientTsconfig = parseJsonc(
        readFileSync("client/tsconfig.json", "utf-8"),
      );

      const serverPaths = (
        serverTsconfig.compilerOptions as Record<string, unknown>
      ).paths as Record<string, string[]>;
      const clientPaths = (
        clientTsconfig.compilerOptions as Record<string, unknown>
      ).paths as Record<string, string[]>;

      // Check for @shared/* alias
      expect(
        serverPaths["@shared/*"],
        "Server should have @shared/* path alias",
      ).toBeDefined();
      expect(
        clientPaths["@shared/*"],
        "Client should have @shared/* path alias",
      ).toBeDefined();

      // Check for #shared/* alias
      expect(
        serverPaths["#shared/*"],
        "Server should have #shared/* path alias",
      ).toBeDefined();
      expect(
        clientPaths["#shared/*"],
        "Client should have #shared/* path alias",
      ).toBeDefined();
    });

    /**
     * Test 3.4: Server uses bundler moduleResolution
     * Validates: Requirement 1.7
     */
    it("should use bundler moduleResolution in server tsconfig", () => {
      const serverTsconfig = parseJsonc(
        readFileSync("server/tsconfig.json", "utf-8"),
      );
      const compilerOptions = serverTsconfig.compilerOptions as Record<
        string,
        unknown
      >;

      expect(
        compilerOptions.moduleResolution,
        "Server should use bundler moduleResolution",
      ).toBe("bundler");
    });

    /**
     * Test 3.5: Root tsconfig defines shared path aliases
     * Validates: Requirement 1.8
     */
    it("should have root tsconfig with shared path aliases", () => {
      const rootTsconfig = parseJsonc(readFileSync("tsconfig.json", "utf-8"));
      const compilerOptions = rootTsconfig.compilerOptions as Record<
        string,
        unknown
      >;
      const paths = compilerOptions.paths as Record<string, string[]>;

      // Check that root tsconfig has path aliases defined
      expect(paths, "Root tsconfig should have paths defined").toBeDefined();

      // Check for shared aliases
      expect(
        paths["@shared/*"],
        "Root tsconfig should have @shared/* path alias",
      ).toBeDefined();
      expect(
        paths["#shared/*"],
        "Root tsconfig should have #shared/* path alias",
      ).toBeDefined();

      // Check for server-specific aliases
      expect(
        paths["@infrastructure/*"],
        "Root tsconfig should have @infrastructure/* path alias",
      ).toBeDefined();
      expect(
        paths["@services/*"],
        "Root tsconfig should have @services/* path alias",
      ).toBeDefined();

      // Check for client-specific aliases
      expect(
        paths["@components/*"],
        "Root tsconfig should have @components/* path alias",
      ).toBeDefined();
      expect(
        paths["@features/*"],
        "Root tsconfig should have @features/* path alias",
      ).toBeDefined();
    });

    /**
     * Test 3.6: Vitest config has matching path aliases
     * Validates: Requirement 1.10
     */
    it("should have vitest config with matching path aliases", () => {
      const vitestConfig = readFileSync(
        "config/test/vitest.config.js",
        "utf-8",
      );

      // Check for server aliases
      const serverAliases = [
        "@infrastructure",
        "@services",
        "@interfaces",
        "@llm",
        "@middleware",
        "@routes",
        "@clients",
        "@config",
        "@types",
        "@utils",
      ];

      const missingServerAliases: string[] = [];
      for (const alias of serverAliases) {
        if (!vitestConfig.includes(alias)) {
          missingServerAliases.push(alias);
        }
      }

      // Check for client aliases
      const clientAliases = [
        "@components",
        "@features",
        "@hooks",
        "@styles",
        "@lib",
        "@schemas",
        "@repositories",
      ];

      const missingClientAliases: string[] = [];
      for (const alias of clientAliases) {
        if (!vitestConfig.includes(alias)) {
          missingClientAliases.push(alias);
        }
      }

      // Check for shared aliases
      const sharedAliases = ["@shared", "#shared"];

      const missingSharedAliases: string[] = [];
      for (const alias of sharedAliases) {
        if (!vitestConfig.includes(alias)) {
          missingSharedAliases.push(alias);
        }
      }

      if (missingServerAliases.length > 0) {
        console.error(
          "Missing server aliases in vitest config:",
          missingServerAliases,
        );
      }
      if (missingClientAliases.length > 0) {
        console.error(
          "Missing client aliases in vitest config:",
          missingClientAliases,
        );
      }
      if (missingSharedAliases.length > 0) {
        console.error(
          "Missing shared aliases in vitest config:",
          missingSharedAliases,
        );
      }

      expect(
        missingServerAliases.length,
        "All server aliases should be in vitest config",
      ).toBe(0);
      expect(
        missingClientAliases.length,
        "All client aliases should be in vitest config",
      ).toBe(0);
      expect(
        missingSharedAliases.length,
        "All shared aliases should be in vitest config",
      ).toBe(0);
    });

    /**
     * Test 3.7: Express type declaration file exists and is included
     * Validates: Requirement 2.7
     */
    it("should have Express type declaration file included in server config", () => {
      // Check that express.d.ts exists
      const expressTypesPath = "server/src/types/express.d.ts";
      expect(
        existsSync(expressTypesPath),
        "Express type declaration file should exist",
      ).toBe(true);

      // Check that server tsconfig includes the types directory
      const serverTsconfig = parseJsonc(
        readFileSync("server/tsconfig.json", "utf-8"),
      );
      const compilerOptions = serverTsconfig.compilerOptions as Record<
        string,
        unknown
      >;
      const typeRoots = compilerOptions.typeRoots as string[];

      expect(
        typeRoots.some((root) => root.includes("src/types")),
        "Server tsconfig should include src/types in typeRoots",
      ).toBe(true);

      // Check that the include pattern covers type declaration files
      const include = serverTsconfig.include as string[];
      expect(
        include.some(
          (pattern) => pattern.includes("types") && pattern.includes(".d.ts"),
        ),
        "Server tsconfig should include type declaration files",
      ).toBe(true);
    });

    /**
     * Test 3.8: Test library types are properly configured
     * Validates: Requirements 3.2, 3.3
     */
    it("should have test library types properly configured", () => {
      // Check that @types/supertest is in package.json devDependencies
      const packageJson = JSON.parse(readFileSync("package.json", "utf-8"));
      const devDependencies = packageJson.devDependencies || {};

      expect(
        devDependencies["@types/supertest"],
        "@types/supertest should be in devDependencies",
      ).toBeDefined();

      // Check that vitest types are available (vitest includes its own types)
      expect(
        devDependencies["vitest"],
        "vitest should be in devDependencies",
      ).toBeDefined();
    });

    /**
     * Test 3.9: tsconfig supports both import styles (with and without extensions)
     * Validates: Requirement 6.3
     */
    it("should support both import styles in tsconfig", () => {
      const rootTsconfig = parseJsonc(readFileSync("tsconfig.json", "utf-8"));
      const compilerOptions = rootTsconfig.compilerOptions as Record<
        string,
        unknown
      >;

      // Check that allowImportingTsExtensions is enabled for flexibility
      expect(
        compilerOptions.allowImportingTsExtensions,
        "Root tsconfig should have allowImportingTsExtensions enabled",
      ).toBe(true);

      // Check that moduleResolution is bundler (supports both styles)
      expect(
        compilerOptions.moduleResolution,
        "Root tsconfig should use bundler moduleResolution",
      ).toBe("bundler");
    });

    /**
     * Test 3.10: All required server path aliases are defined
     * Validates: Requirement 1.1 (comprehensive check)
     */
    it("should have all required server path aliases defined", () => {
      const serverTsconfig = parseJsonc(
        readFileSync("server/tsconfig.json", "utf-8"),
      );
      const compilerOptions = serverTsconfig.compilerOptions as Record<
        string,
        unknown
      >;
      const paths = compilerOptions.paths as Record<string, string[]>;

      const requiredServerAliases = [
        "@infrastructure/*",
        "@services/*",
        "@interfaces/*",
        "@types/*",
        "@utils/*",
        "@config/*",
        "@llm/*",
        "@middleware/*",
        "@routes/*",
        "@clients/*",
        "@shared/*",
        "#shared/*",
      ];

      const missingAliases: string[] = [];
      for (const alias of requiredServerAliases) {
        if (!paths[alias]) {
          missingAliases.push(alias);
        }
      }

      if (missingAliases.length > 0) {
        console.error("Missing required server path aliases:", missingAliases);
      }

      expect(
        missingAliases.length,
        `Expected all required server path aliases to be defined, but missing: ${missingAliases.join(", ")}`,
      ).toBe(0);
    });

    /**
     * Test 3.11: All required client path aliases are defined
     * Validates: Requirement 1.2 (comprehensive check)
     */
    it("should have all required client path aliases defined", () => {
      const clientTsconfig = parseJsonc(
        readFileSync("client/tsconfig.json", "utf-8"),
      );
      const compilerOptions = clientTsconfig.compilerOptions as Record<
        string,
        unknown
      >;
      const paths = compilerOptions.paths as Record<string, string[]>;

      const requiredClientAliases = [
        "@/*",
        "@components/*",
        "@features/*",
        "@hooks/*",
        "@types/*",
        "@utils/*",
        "@config/*",
        "@shared/*",
        "#shared/*",
      ];

      const missingAliases: string[] = [];
      for (const alias of requiredClientAliases) {
        if (!paths[alias]) {
          missingAliases.push(alias);
        }
      }

      if (missingAliases.length > 0) {
        console.error("Missing required client path aliases:", missingAliases);
      }

      expect(
        missingAliases.length,
        `Expected all required client path aliases to be defined, but missing: ${missingAliases.join(", ")}`,
      ).toBe(0);
    });
  });
});
