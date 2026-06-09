#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

type Bucket = "likely-dead" | "single-consumer" | "multi-consumer";
type Decision = "keep" | "merge" | "delete";

interface HookRecord {
  key: string;
  symbol: string;
  definedIn: string;
  productionCallerFiles: Set<string>;
  testCallerFiles: Set<string>;
  importPaths: Set<string>;
  directCallerFiles: Set<string>;
  barrelCallerFiles: Set<string>;
  importEvidence: Set<string>;
  bucket: Bucket;
  decision: Decision;
  chainPattern: string;
  evidence: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const tsconfigPath = path.join(repoRoot, "tsconfig.json");

const REPORT_DEFAULT_PATH = path.join(
  repoRoot,
  "docs",
  "architecture",
  "HOOK_AUDIT_2026-02-10.md",
);

const normalizePath = (filePath: string): string =>
  path.resolve(filePath).replaceAll("\\", "/");

const relativeToRepo = (filePath: string): string =>
  path.relative(repoRoot, filePath).replaceAll("\\", "/");

const isHookFile = (filePath: string): boolean => {
  const normalized = normalizePath(filePath);
  if (
    !normalized.startsWith(normalizePath(path.join(repoRoot, "client", "src")))
  ) {
    return false;
  }
  const rel = relativeToRepo(normalized);
  if (
    !/^client\/src\/.*\/use[^/]*\.(ts|tsx)$/.test(rel) &&
    !/^client\/src\/use[^/]*\.(ts|tsx)$/.test(rel)
  ) {
    return false;
  }
  return !/\.(test|spec|stories)\.(ts|tsx)$/.test(rel);
};

const isTestFile = (filePath: string): boolean => {
  const rel = relativeToRepo(filePath);
  return (
    /(^|\/)__tests__\//.test(rel) ||
    /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(rel) ||
    /\.stories\.(ts|tsx|js|jsx)$/.test(rel)
  );
};

const isProductionCaller = (filePath: string): boolean => !isTestFile(filePath);

const isImportPathDirect = (modulePath: string): boolean =>
  /(^|\/)use[^/'"]+$/.test(modulePath);

const getCompilerConfig = (): ts.ParsedCommandLine => {
  const readResult = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (readResult.error) {
    const message = ts.flattenDiagnosticMessageText(
      readResult.error.messageText,
      "\n",
    );
    throw new Error(`Failed to read tsconfig: ${message}`);
  }
  return ts.parseJsonConfigFileContent(
    readResult.config,
    ts.sys,
    path.dirname(tsconfigPath),
    undefined,
    tsconfigPath,
  );
};

const resolveAliasedSymbol = (
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
): ts.Symbol => {
  if ((symbol.flags & ts.SymbolFlags.Alias) === 0) {
    return symbol;
  }
  try {
    return checker.getAliasedSymbol(symbol);
  } catch {
    return symbol;
  }
};

const getSymbolKey = (symbol: ts.Symbol): string => {
  const decl = symbol.declarations?.[0];
  if (!decl) return `unknown:${symbol.getName()}`;
  return `${normalizePath(decl.getSourceFile().fileName)}:${decl.getStart()}:${symbol.getName()}`;
};

const safeSort = (values: Iterable<string>): string[] =>
  Array.from(values).sort((a, b) => a.localeCompare(b));

const parseArgs = (): { writePath: string | null } => {
  const argv = process.argv.slice(2);
  let writePath: string | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--write") {
      const next = argv[i + 1];
      if (!next) throw new Error("--write requires a file path");
      writePath = path.isAbsolute(next)
        ? next
        : path.resolve(process.cwd(), next);
      i += 1;
      continue;
    }
    if (arg.startsWith("--write=")) {
      const value = arg.slice("--write=".length);
      writePath = path.isAbsolute(value)
        ? value
        : path.resolve(process.cwd(), value);
    }
  }

  return { writePath };
};

const buildAudit = (): {
  records: HookRecord[];
  duplicateSymbols: Array<{ symbol: string; files: string[] }>;
  summary: {
    totalHookSymbols: number;
    totalHookFiles: number;
    likelyDead: number;
    singleConsumer: number;
    multiConsumer: number;
  };
} => {
  const parsedConfig = getCompilerConfig();
  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
  });
  const checker = program.getTypeChecker();

  const sourceFiles = program
    .getSourceFiles()
    .filter((file) => !file.isDeclarationFile)
    .filter((file) =>
      normalizePath(file.fileName).startsWith(normalizePath(repoRoot)),
    )
    .filter((file) => !normalizePath(file.fileName).includes("/node_modules/"));

  const hookFiles = sourceFiles.filter((sourceFile) =>
    isHookFile(sourceFile.fileName),
  );

  const recordsByKey = new Map<string, HookRecord>();
  const hooksByFile = new Map<string, HookRecord[]>();
  const hooksBySymbolName = new Map<string, HookRecord[]>();

  for (const hookFile of hookFiles) {
    const moduleSymbol = checker.getSymbolAtLocation(hookFile);
    if (!moduleSymbol) continue;

    const exportedSymbols = checker.getExportsOfModule(moduleSymbol);
    for (const exportedSymbol of exportedSymbols) {
      const exportName = exportedSymbol.getName();
      if (!/^use[A-Za-z0-9_]*$/.test(exportName)) continue;

      const canonicalSymbol = resolveAliasedSymbol(checker, exportedSymbol);
      const declarations = canonicalSymbol.declarations ?? [];
      const declaredInThisFile = declarations.some(
        (decl) =>
          normalizePath(decl.getSourceFile().fileName) ===
          normalizePath(hookFile.fileName),
      );

      if (!declaredInThisFile) {
        continue;
      }

      const key = getSymbolKey(canonicalSymbol);
      if (recordsByKey.has(key)) continue;

      const record: HookRecord = {
        key,
        symbol: exportName,
        definedIn: normalizePath(hookFile.fileName),
        productionCallerFiles: new Set<string>(),
        testCallerFiles: new Set<string>(),
        importPaths: new Set<string>(),
        directCallerFiles: new Set<string>(),
        barrelCallerFiles: new Set<string>(),
        importEvidence: new Set<string>(),
        bucket: "multi-consumer",
        decision: "keep",
        chainPattern: "none",
        evidence: "",
      };

      recordsByKey.set(key, record);

      const byFile = hooksByFile.get(record.definedIn) ?? [];
      byFile.push(record);
      hooksByFile.set(record.definedIn, byFile);

      const byName = hooksBySymbolName.get(record.symbol) ?? [];
      byName.push(record);
      hooksBySymbolName.set(record.symbol, byName);
    }
  }

  for (const sourceFile of sourceFiles) {
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      if (!statement.importClause) continue;
      if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;

      const modulePath = statement.moduleSpecifier.text;
      const importClause = statement.importClause;
      const importNames: ts.Identifier[] = [];

      if (importClause.name) {
        importNames.push(importClause.name);
      }

      if (importClause.namedBindings) {
        if (ts.isNamedImports(importClause.namedBindings)) {
          for (const element of importClause.namedBindings.elements) {
            importNames.push(element.name);
          }
        }
      }

      if (importNames.length === 0) continue;

      for (const identifier of importNames) {
        const localSymbol = checker.getSymbolAtLocation(identifier);
        if (!localSymbol) continue;
        const canonical = resolveAliasedSymbol(checker, localSymbol);
        const key = getSymbolKey(canonical);
        const record = recordsByKey.get(key);
        if (!record) continue;

        const caller = normalizePath(sourceFile.fileName);
        const callerRel = relativeToRepo(caller);
        const isDirect =
          normalizePath(record.definedIn) ===
          normalizePath(
            canonical.declarations?.[0]?.getSourceFile().fileName ?? "",
          );
        const directByImportPath = isImportPathDirect(modulePath);
        const importKind = isDirect && directByImportPath ? "direct" : "barrel";

        if (isTestFile(caller)) {
          record.testCallerFiles.add(caller);
        } else if (isProductionCaller(caller)) {
          record.productionCallerFiles.add(caller);
        }
        record.importPaths.add(modulePath);
        if (importKind === "direct") {
          record.directCallerFiles.add(caller);
        } else {
          record.barrelCallerFiles.add(caller);
        }
        record.importEvidence.add(`${callerRel} <= ${modulePath}`);
      }
    }
  }

  const records = Array.from(recordsByKey.values());

  const recordByFileSingleSymbol = new Map<string, HookRecord>();
  for (const [filePath, hooks] of hooksByFile.entries()) {
    if (hooks.length === 1 && hooks[0]) {
      recordByFileSingleSymbol.set(filePath, hooks[0]);
    }
  }

  for (const record of records) {
    const prodConsumers = safeSort(record.productionCallerFiles);
    if (prodConsumers.length === 0) {
      record.bucket = "likely-dead";
    } else if (prodConsumers.length === 1) {
      record.bucket = "single-consumer";
    } else {
      record.bucket = "multi-consumer";
    }

    if (record.bucket === "likely-dead") {
      record.decision = "delete";
    } else {
      record.decision = "keep";
    }

    if (record.bucket === "single-consumer") {
      const singleConsumer = safeSort(record.productionCallerFiles)[0];
      if (singleConsumer === undefined) {
        record.chainPattern = "none";
      } else {
        const consumerRecord = recordByFileSingleSymbol.get(singleConsumer);
        if (consumerRecord) {
          const consumerNext = safeSort(
            consumerRecord.productionCallerFiles,
          )[0];
          record.chainPattern =
            consumerNext === undefined
              ? `${record.symbol} -> ${consumerRecord.symbol}`
              : `${record.symbol} -> ${consumerRecord.symbol} -> ${relativeToRepo(consumerNext)}`;
        } else {
          record.chainPattern = `${record.symbol} -> ${relativeToRepo(singleConsumer)}`;
        }
      }
    } else if (record.bucket === "multi-consumer") {
      record.chainPattern = "fan-out";
    } else {
      record.chainPattern = "none";
    }

    const directCount = record.directCallerFiles.size;
    const barrelCount = record.barrelCallerFiles.size;
    const importShape =
      directCount === 0 && barrelCount === 0
        ? "none"
        : directCount > 0 && barrelCount === 0
          ? "direct"
          : directCount === 0 && barrelCount > 0
            ? "barrel"
            : "mixed";

    record.evidence = `AST(prod=${record.productionCallerFiles.size},test=${record.testCallerFiles.size},direct=${directCount},barrel=${barrelCount},shape=${importShape})`;
  }

  const duplicateSymbols = Array.from(hooksBySymbolName.entries())
    .filter(([, hookRecords]) => hookRecords.length > 1)
    .map(([symbol, hookRecords]) => ({
      symbol,
      files: safeSort(
        hookRecords.map((record) => relativeToRepo(record.definedIn)),
      ),
    }))
    .sort((left, right) => left.symbol.localeCompare(right.symbol));

  const summary = {
    totalHookSymbols: records.length,
    totalHookFiles: hookFiles.length,
    likelyDead: records.filter((record) => record.bucket === "likely-dead")
      .length,
    singleConsumer: records.filter(
      (record) => record.bucket === "single-consumer",
    ).length,
    multiConsumer: records.filter(
      (record) => record.bucket === "multi-consumer",
    ).length,
  };

  records.sort((left, right) => {
    if (left.symbol === right.symbol) {
      return left.definedIn.localeCompare(right.definedIn);
    }
    return left.symbol.localeCompare(right.symbol);
  });

  return { records, duplicateSymbols, summary };
};

const renderDirectVsBarrel = (record: HookRecord): string => {
  const direct = record.directCallerFiles.size;
  const barrel = record.barrelCallerFiles.size;
  if (direct === 0 && barrel === 0) return "none";
  if (direct > 0 && barrel === 0) return "direct";
  if (direct === 0 && barrel > 0) return "barrel";
  return "mixed";
};

const escapeCell = (value: string): string => value.replaceAll("|", "\\|");

const renderMarkdown = (audit: ReturnType<typeof buildAudit>): string => {
  const lines: string[] = [];
  lines.push("# Hook Audit Report (2026-02-10)");
  lines.push("");
  lines.push("## Scope");
  lines.push("- Root: `client/src`");
  lines.push(
    "- Files: `use*.ts` / `use*.tsx` (tests/stories excluded from inventory)",
  );
  lines.push(
    "- Method: TypeScript AST import graph + symbol-level classification",
  );
  lines.push("");
  lines.push("## Baseline");
  lines.push(`- Total hook files: **${audit.summary.totalHookFiles}**`);
  lines.push(
    `- Total exported hook symbols: **${audit.summary.totalHookSymbols}**`,
  );
  lines.push(`- likely-dead: **${audit.summary.likelyDead}**`);
  lines.push(`- single-consumer: **${audit.summary.singleConsumer}**`);
  lines.push(`- multi-consumer: **${audit.summary.multiConsumer}**`);
  lines.push("");

  lines.push("## Duplicate Hook Symbols");
  if (audit.duplicateSymbols.length === 0) {
    lines.push("- None");
  } else {
    for (const duplicate of audit.duplicateSymbols) {
      lines.push(`- \`${duplicate.symbol}\``);
      for (const file of duplicate.files) {
        lines.push(`  - \`${file}\``);
      }
    }
  }
  lines.push("");

  lines.push("## Inventory");
  lines.push(
    "| symbol | defined_in | production_callers | test_callers | import_paths | direct_vs_barrel | chain_pattern | decision | evidence |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");

  for (const record of audit.records) {
    const productionCallers = safeSort(record.productionCallerFiles)
      .map(relativeToRepo)
      .join("<br>");
    const testCallers = safeSort(record.testCallerFiles)
      .map(relativeToRepo)
      .join("<br>");
    const importPaths = safeSort(record.importPaths).join("<br>");
    const row = [
      record.symbol,
      relativeToRepo(record.definedIn),
      productionCallers || "-",
      testCallers || "-",
      importPaths || "-",
      renderDirectVsBarrel(record),
      record.chainPattern,
      record.decision,
      record.evidence,
    ]
      .map((value) => escapeCell(value))
      .join(" | ");
    lines.push(`| ${row} |`);
  }

  lines.push("");
  lines.push("## Notes");
  lines.push(
    "- `decision=delete` indicates zero production callers in AST graph.",
  );
  lines.push(
    "- `decision=merge` indicates candidate chain flattening seam (single-consumer chain, no standalone tests).",
  );
  lines.push("- `decision=keep` indicates active usage or stable boundary.");
  lines.push(
    "- Pass-B corroboration (`rg`) is executed separately before deletion.",
  );
  lines.push("");

  return lines.join("\n");
};

const main = (): void => {
  const { writePath } = parseArgs();
  const audit = buildAudit();
  const markdown = renderMarkdown(audit);

  if (writePath) {
    const targetPath = normalizePath(writePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, `${markdown}\n`, "utf8");
    console.log(`[hook-audit] wrote ${relativeToRepo(targetPath)}`);
  } else {
    process.stdout.write(markdown);
  }
};

main();
