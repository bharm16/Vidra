import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

async function runDownload(names: string[]): Promise<{
  root: string;
  modelDirectory: string;
  result: ReturnType<typeof spawnSync>;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "vidra-model-script-test-"));
  directories.push(root);
  const bin = path.join(root, "bin");
  await mkdir(bin);
  // Select the SDK fallback regardless of developer gcloud/gsutil installs.
  for (const name of ["dirname", "mkdir", "mktemp", "rm", "find", "cp"]) {
    const executable = execFileSync("/bin/sh", ["-c", `command -v ${name}`], { encoding: "utf8" }).trim();
    await symlink(executable, path.join(bin, name));
  }
  await symlink(process.execPath, path.join(bin, "node"));

  const sdk = path.join(root, "storage.mjs");
  await writeFile(sdk, [
    "import { writeFile } from 'node:fs/promises';",
    "export class Storage {",
    "  bucket() { return { getFiles: async () => [JSON.parse(process.env.VIDRA_TEST_MODEL_NAMES).map(name => ({",
    "    name, download: async ({ destination }) => writeFile(destination, 'model fixture')",
    "  }))] }; }",
    "}",
  ].join("\n"));
  const loader = path.join(root, "loader.mjs");
  await writeFile(loader, [
    "export function resolve(specifier, context, nextResolve) {",
    `  if (specifier === '@google-cloud/storage') return { url: ${JSON.stringify(pathToFileURL(sdk).href)}, shortCircuit: true };`,
    "  return nextResolve(specifier, context);",
    "}",
  ].join("\n"));
  const preload = path.join(root, "preload.mjs");
  await writeFile(preload, [
    "import { register } from 'node:module';",
    `register(${JSON.stringify(pathToFileURL(loader).href)}, import.meta.url);`,
  ].join("\n"));
  const modelDirectory = path.join(root, "not-created-yet", "models");
  const result = spawnSync("/bin/bash", [path.resolve("scripts/download-models.sh")], {
    cwd: path.resolve("."),
    env: {
      PATH: bin,
      NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`,
      SPAN_LABELING_MODEL_DIR: modelDirectory,
      SPAN_LABELING_MODELS_GCS_URI: "gs://test-models/models/",
      VIDRA_TEST_MODEL_NAMES: JSON.stringify(names),
    },
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });
  return { root, modelDirectory, result };
}

describe("model download SDK fallback", () => {
  it("downloads legitimate nested assets without credentials or cloud requests", async () => {
    const { modelDirectory, result } = await runDownload(["models/model.onnx", "models/tokenizer/config.json"]);
    expect(result.error).toBeUndefined();
    expect(result.status, String(result.stderr)).toBe(0);
    expect(await readFile(path.join(modelDirectory, "model.onnx"), "utf8")).toBe("model fixture");
    expect(await readFile(path.join(modelDirectory, "tokenizer/config.json"), "utf8")).toBe("model fixture");
  });

  it("rejects a traversing object before downloading any object", async () => {
    const { root, modelDirectory, result } = await runDownload(["models/model.onnx", "models/../../outside"]);
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(String(result.stderr)).toMatch(/unsafe relative filename/);
    await expect(readFile(path.join(root, "outside"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(path.join(modelDirectory, "model.onnx"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
