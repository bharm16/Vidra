/**
 * Shared AST walker for Express route discovery.
 *
 * Extracted from scripts/generate-route-map.ts so the route-discovery logic
 * can be consumed by both the Markdown route-map renderer and the architecture-
 * map generator without duplication.
 *
 * The walker recognizes three patterns per exported function body:
 *   router.<method>("/path", ...)           -> emits an endpoint under the caller's prefix
 *   router.use("/sub", <factoryCall>)       -> descends into the sub-router under /sub
 *   register<X>Route(router, ...)           -> inlines endpoints from the register fn
 *
 * Gated conditional blocks (`if (foo) { router.use(...) }`) are still expanded
 * because the goal is to enumerate every route the server *can* register, not
 * what it *does* register on a given process configuration.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const SERVER_ROOT = path.join(REPO_ROOT, "server");
const SERVER_SRC = path.join(SERVER_ROOT, "src");

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "head",
  "options",
]);

/** A single resolved HTTP endpoint in the final route map. */
export interface RouteEntry {
  method: string;
  fullPath: string;
  sourceFile: string;
}

/** A reference to a function exported from a file. */
interface FunctionRef {
  filePath: string;
  exportName: string;
}

/** Loaded state for a single source file. */
interface FileRecord {
  sourceFile: ts.SourceFile;
  /** Map from local identifier -> absolute path of the module it was imported from. */
  importMap: Map<string, string>;
  /** Function body nodes keyed by exported name (top-level fns + exported const fns). */
  functionBodies: Map<string, ts.Node>;
}

const fileCache = new Map<string, FileRecord>();

function readFile(filePath: string): ts.SourceFile {
  const text = fs.readFileSync(filePath, "utf8");
  return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
}

/** Resolve an import specifier like "./foo" or "@routes/foo" to an absolute file path. */
function resolveImportSpecifier(
  fromFile: string,
  specifier: string,
): string | null {
  if (specifier.startsWith(".")) {
    return resolveExtension(path.resolve(path.dirname(fromFile), specifier));
  }

  // Server tsconfig path aliases — mirror server/tsconfig.json paths.
  const aliasPrefixes: Array<[string, string]> = [
    ["@routes/", path.join(SERVER_SRC, "routes") + "/"],
    ["@middleware/", path.join(SERVER_SRC, "middleware") + "/"],
    ["@services/", path.join(SERVER_SRC, "services") + "/"],
    ["@config/", path.join(SERVER_SRC, "config") + "/"],
    ["@infrastructure/", path.join(SERVER_SRC, "infrastructure") + "/"],
    ["@llm/", path.join(SERVER_SRC, "llm") + "/"],
    ["@clients/", path.join(SERVER_SRC, "clients") + "/"],
    ["@utils/", path.join(SERVER_SRC, "utils") + "/"],
    ["@interfaces/", path.join(SERVER_SRC, "interfaces") + "/"],
    ["@api/", path.join(SERVER_SRC, "api") + "/"],
    ["@server/", SERVER_SRC + "/"],
  ];
  for (const [prefix, target] of aliasPrefixes) {
    if (specifier.startsWith(prefix)) {
      return resolveExtension(
        path.join(target, specifier.slice(prefix.length)),
      );
    }
  }

  // External packages (express, zod, etc.) — we don't care about their internals.
  return null;
}

/**
 * Given a path with or without extension, pick whichever file actually exists:
 *   foo.ts, foo/index.ts, foo (as-is).
 */
function resolveExtension(basePath: string): string | null {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.ts"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

/** Parse imports from a source file into { localName -> absolute module path }. */
function collectImports(sourceFile: ts.SourceFile): Map<string, string> {
  const imports = new Map<string, string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const spec = statement.moduleSpecifier;
    if (!ts.isStringLiteral(spec)) continue;
    const resolved = resolveImportSpecifier(sourceFile.fileName, spec.text);
    if (!resolved) continue;

    const clause = statement.importClause;
    if (!clause) continue;

    if (clause.name) {
      imports.set(clause.name.text, resolved);
    }
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        imports.set(element.name.text, resolved);
      }
    }
  }
  return imports;
}

/** Collect top-level function declarations + exported const arrow/function expressions. */
function collectFunctionBodies(
  sourceFile: ts.SourceFile,
): Map<string, ts.Node> {
  const bodies = new Map<string, ts.Node>();

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      if (!statement.name || !statement.body) continue;
      bodies.set(statement.name.text, statement.body);
    } else if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (!decl.initializer || !ts.isIdentifier(decl.name)) continue;
        const init = decl.initializer;
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
          if (init.body) bodies.set(decl.name.text, init.body);
        }
      }
    }
  }

  return bodies;
}

function getFileRecord(filePath: string): FileRecord {
  const cached = fileCache.get(filePath);
  if (cached) return cached;

  const sourceFile = readFile(filePath);
  const record: FileRecord = {
    sourceFile,
    importMap: collectImports(sourceFile),
    functionBodies: collectFunctionBodies(sourceFile),
  };
  fileCache.set(filePath, record);
  return record;
}

/** Get a string literal value from a call argument, or null if it isn't one. */
function literalString(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

/**
 * Unwrap an expression: strip `as Foo`, parentheses, satisfies expressions, etc.
 */
function unwrap(expr: ts.Expression): ts.Expression {
  let e: ts.Expression = expr;
  while (true) {
    if (ts.isAsExpression(e) || ts.isTypeAssertionExpression(e)) {
      e = e.expression;
    } else if (ts.isParenthesizedExpression(e)) {
      e = e.expression;
    } else if (ts.isSatisfiesExpression(e)) {
      e = e.expression;
    } else {
      break;
    }
  }
  return e;
}

/**
 * Resolve an expression to a FunctionRef (pointer to the factory that builds the router).
 */
function resolveExpressionToRef(
  expr: ts.Expression,
  localVars: Map<string, ts.Expression>,
  fileRecord: FileRecord,
): FunctionRef | null {
  const unwrapped = unwrap(expr);

  if (ts.isCallExpression(unwrapped)) {
    return resolveExpressionToRef(unwrapped.expression, localVars, fileRecord);
  }

  if (ts.isIdentifier(unwrapped)) {
    const name = unwrapped.text;
    // Local const var -> follow to its initializer
    const localInit = localVars.get(name);
    if (localInit) {
      return resolveExpressionToRef(localInit, localVars, fileRecord);
    }
    // Imported binding
    const importedFrom = fileRecord.importMap.get(name);
    if (importedFrom) {
      return { filePath: importedFrom, exportName: name };
    }
    // Same-file function definition
    if (fileRecord.functionBodies.has(name)) {
      return {
        filePath: fileRecord.sourceFile.fileName,
        exportName: name,
      };
    }
  }

  return null;
}

/** Collect `const foo = <expr>` assignments in every block within the body. */
function collectLocalVars(body: ts.Node): Map<string, ts.Expression> {
  const locals = new Map<string, ts.Expression>();

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node)) {
      if (ts.isIdentifier(node.name) && node.initializer) {
        locals.set(node.name.text, node.initializer);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);

  return locals;
}

/** Join two path segments, normalizing duplicate slashes and trailing slashes. */
function joinPaths(prefix: string, segment: string): string {
  const combined = `${prefix}/${segment}`.replace(/\/+/g, "/");
  if (combined.length > 1 && combined.endsWith("/")) {
    return combined.slice(0, -1);
  }
  return combined;
}

/**
 * Expand a function body into RouteEntries.
 */
function expandBody(
  body: ts.Node,
  filePath: string,
  prefix: string,
  visited: Set<string>,
): RouteEntry[] {
  const fileRecord = getFileRecord(filePath);
  const localVars = collectLocalVars(body);
  const entries: RouteEntry[] = [];

  const descend = (ref: FunctionRef | null, nextPrefix: string): void => {
    if (!ref) return;
    const key = `${ref.filePath}::${ref.exportName}::${nextPrefix}`;
    if (visited.has(key)) return;
    visited.add(key);
    const targetRecord = getFileRecord(ref.filePath);
    const targetBody = targetRecord.functionBodies.get(ref.exportName);
    if (!targetBody) return;
    entries.push(...expandBody(targetBody, ref.filePath, nextPrefix, visited));
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;

      if (ts.isPropertyAccessExpression(callee)) {
        const methodName = callee.name.text;

        if (HTTP_METHODS.has(methodName)) {
          const firstArg = node.arguments[0];
          if (firstArg) {
            const literal = literalString(firstArg);
            if (literal !== null) {
              entries.push({
                method: methodName.toUpperCase(),
                fullPath: joinPaths(prefix, literal),
                sourceFile: path.relative(REPO_ROOT, filePath),
              });
            }
          }
        } else if (methodName === "use") {
          const firstArg = node.arguments[0];
          if (firstArg) {
            const subPath = literalString(firstArg);
            if (subPath !== null) {
              for (let i = node.arguments.length - 1; i >= 1; i--) {
                const arg = node.arguments[i];
                if (!arg) continue;
                const ref = resolveExpressionToRef(arg, localVars, fileRecord);
                if (ref) {
                  descend(ref, joinPaths(prefix, subPath));
                  break;
                }
              }
            } else {
              const ref = resolveExpressionToRef(
                firstArg,
                localVars,
                fileRecord,
              );
              if (ref) descend(ref, prefix);
            }
          }
        }
      } else if (ts.isIdentifier(callee)) {
        const firstArg = node.arguments[0];
        if (firstArg && ts.isIdentifier(firstArg)) {
          const ref = resolveExpressionToRef(callee, localVars, fileRecord);
          if (ref) descend(ref, prefix);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(body);
  return entries;
}

interface TopLevelMount {
  prefix: string;
  ref: FunctionRef | null;
  inlineMethod?: string;
  inlineSourceFile?: string;
}

/**
 * Walk the top-level registration files. For each `app.use("/prefix", <factory>)`
 * or `app.<method>("/path", ...)`, return a mount we can expand.
 */
function collectTopLevelMounts(filePath: string): TopLevelMount[] {
  const record = getFileRecord(filePath);
  const mounts: TopLevelMount[] = [];

  const localVars = collectLocalVars(record.sourceFile);

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isPropertyAccessExpression(callee)) {
        const obj = callee.expression;
        const isApp =
          ts.isIdentifier(obj) && (obj.text === "app" || obj.text === "router");
        if (isApp && ts.isIdentifier(obj) && obj.text === "app") {
          const methodName = callee.name.text;

          if (methodName === "use") {
            const firstArg = node.arguments[0];
            const prefix = firstArg ? literalString(firstArg) : null;
            if (prefix !== null) {
              for (let i = node.arguments.length - 1; i >= 1; i--) {
                const arg = node.arguments[i];
                if (!arg) continue;
                const ref = resolveExpressionToRef(arg, localVars, record);
                if (ref) {
                  mounts.push({ prefix, ref });
                  break;
                }
              }
            }
          } else if (HTTP_METHODS.has(methodName)) {
            const firstArg = node.arguments[0];
            const literal = firstArg ? literalString(firstArg) : null;
            if (literal !== null) {
              mounts.push({
                prefix: literal,
                ref: null,
                inlineMethod: methodName.toUpperCase(),
                inlineSourceFile: path.relative(REPO_ROOT, filePath),
              });
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(record.sourceFile);
  return mounts;
}

/**
 * Extract all reachable HTTP route entries from the server source.
 *
 * Walks app.ts, config/routes.config.ts, and config/routes/*.ts as
 * the authoritative top-level mount points, then recursively expands
 * router factory functions to enumerate every route the server can register.
 */
export function extractRoutes(): RouteEntry[] {
  // Reset file cache so each call gets a fresh traversal (important for tests).
  fileCache.clear();

  const topLevelFiles = [
    path.join(SERVER_SRC, "app.ts"),
    path.join(SERVER_SRC, "config", "routes.config.ts"),
    ...fs
      .readdirSync(path.join(SERVER_SRC, "config", "routes"))
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => path.join(SERVER_SRC, "config", "routes", f)),
  ];

  const allMounts: TopLevelMount[] = [];
  for (const file of topLevelFiles) {
    if (!fs.existsSync(file)) continue;
    allMounts.push(...collectTopLevelMounts(file));
  }

  const entries: RouteEntry[] = [];
  for (const mount of allMounts) {
    if (mount.inlineMethod && mount.inlineSourceFile) {
      entries.push({
        method: mount.inlineMethod,
        fullPath: mount.prefix === "" ? "/" : mount.prefix,
        sourceFile: mount.inlineSourceFile,
      });
      continue;
    }
    if (!mount.ref) continue;

    const visited = new Set<string>();
    const targetRecord = getFileRecord(mount.ref.filePath);
    const targetBody = targetRecord.functionBodies.get(mount.ref.exportName);
    if (!targetBody) continue;
    visited.add(
      `${mount.ref.filePath}::${mount.ref.exportName}::${mount.prefix}`,
    );
    entries.push(
      ...expandBody(targetBody, mount.ref.filePath, mount.prefix, visited),
    );
  }

  // Filter out phantom entries produced when the walker resolves a factory call
  // (e.g. createAssetRoutes(assetService)) via the generic identifier-callee branch
  // and descends with the parent prefix rather than the sub-router's mount prefix.
  // Those produce entries like { fullPath: "/api" } that are never real routes —
  // legitimate list-collection routes live at paths like "/api/assets", not "/api".
  const BARE_PREFIXES = new Set(["/api", "/", ""]);
  const filtered = entries.filter((e) => !BARE_PREFIXES.has(e.fullPath));

  // Deduplicate (identical method+path+source from multiple registration paths)
  const seen = new Set<string>();
  const unique: RouteEntry[] = [];
  for (const entry of filtered) {
    const key = `${entry.method} ${entry.fullPath} ${entry.sourceFile}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }

  unique.sort((a, b) => {
    if (a.fullPath !== b.fullPath) return a.fullPath.localeCompare(b.fullPath);
    return a.method.localeCompare(b.method);
  });

  return unique;
}
