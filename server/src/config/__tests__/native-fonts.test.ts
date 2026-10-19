import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import ts from "typescript";
import { expect, it } from "vitest";

const execute = promisify(execFile);
const startupUrl = new URL("../native-fonts.js", import.meta.url).href;
const instrumentUrl = new URL("../../../instrument.mjs", import.meta.url).href;
const rasterizerUrl = new URL("../../services/video-export/CaptionRasterizer.ts", import.meta.url).href;
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const marker = "__VIDRA_FONT_PROBE__";

async function probe(code: string, backend?: string): Promise<unknown> {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "test", TSX_TSCONFIG_PATH: `${root}server/tsconfig.json` };
  delete env.PANGOCAIRO_BACKEND;
  if (backend !== undefined) env.PANGOCAIRO_BACKEND = backend;
  const { stdout } = await execute(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", code], {
    cwd: root,
    env,
    timeout: 15_000,
    maxBuffer: 256 * 1024,
  });
  const result = stdout.split("\n").find(line => line.startsWith(marker));
  if (!result) throw new Error("The isolated native-font probe did not report a result.");
  return JSON.parse(result.slice(marker.length)) as unknown;
}

it("keeps instrumentation first and configures native fonts before application imports", async () => {
  const source = await readFile(new URL("../../../index.ts", import.meta.url), "utf8");
  const entry = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest);
  const imports = entry.statements.filter(ts.isImportDeclaration).map(statement =>
    ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : "",
  );
  expect(imports.slice(0, 2)).toEqual(["./instrument.mjs", "./src/config/native-fonts.js"]);
});

it("defaults only an unset macOS backend and preserves explicit operator choices", async () => {
  const cases = [
    { platform: "darwin", backend: undefined, expected: "fontconfig" },
    { platform: "darwin", backend: "coretext", expected: "coretext" },
    { platform: "darwin", backend: "", expected: "" },
    { platform: "linux", backend: undefined, expected: null },
    { platform: "win32", backend: "custom", expected: "custom" },
  ];
  const results = await Promise.all(cases.map(async scenario => {
    const result = await probe(`
      Object.defineProperty(process, "platform", { value: ${JSON.stringify(scenario.platform)} });
      await import(${JSON.stringify(startupUrl)});
      process.stdout.write(${JSON.stringify(marker)} + JSON.stringify(process.env.PANGOCAIRO_BACKEND ?? null));
    `, scenario.backend);
    return { scenario, result };
  }));
  for (const { scenario, result } of results) expect(result).toBe(scenario.expected);
});

it.runIf(process.platform === "darwin")("selects bundled Inter in the real rasterizer before the first Pango font map", async () => {
  // These static imports reproduce the entry point's first two imports, then
  // load the actual native caption implementation in a fresh, uninitialized process.
  const result = await probe(`
    import ${JSON.stringify(instrumentUrl)};
    import ${JSON.stringify(startupUrl)};
    import { rasterizeCaption, videoFontPath } from ${JSON.stringify(rasterizerUrl)};
    import sharp from "sharp";
    import { readFile } from "node:fs/promises";
    import { createHash } from "node:crypto";
    const cue = {
      id: "startup_font", text: "Make room for evening.", anchor: { kind: "composition" },
      startFrame: 0, endFrame: 30, x: 0, y: 0, width: 0.9, height: 0.2,
      fontSize: 32, fontWeight: 500, color: "#ffffff", align: "center"
    };
    const rasters = [];
    for (const weight of [400, 500, 600, 400, 500, 600]) {
      const raster = await rasterizeCaption({ ...cue, fontWeight: weight }, "landscape");
      const { data, info } = await sharp(raster.png).raw().toBuffer({ resolveWithObject: true });
      let left = info.width, right = -1;
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * 4 + 3] > 16) { left = Math.min(left, x); right = Math.max(right, x); }
      }
      rasters.push({
        weight,
        fontSha256: createHash("sha256").update(await readFile(videoFontPath(weight))).digest("hex"),
        inkWidth: right - left + 1
      });
    }
    process.stdout.write(${JSON.stringify(marker)} + JSON.stringify({
      backend: process.env.PANGOCAIRO_BACKEND,
      rasters
    }));
  `);
  const expectedRasters = [
    { weight: 400, fontSha256: "40d692fce188e4471e2b3cba937be967878f631ad3ebbbdcd587687c7ebe0c82", inkWidth: 355 },
    { weight: 500, fontSha256: "97ad806f526e41546d46365bb3a393145f75b7b1568913db74549ad8b8dba872", inkWidth: 357 },
    { weight: 600, fontSha256: "78a843fade9d4612a5567302fb595b56976eb5fcebf4fea5a5912d638bafcde3", inkWidth: 361 },
  ];
  expect(result).toEqual({
    backend: "fontconfig",
    // Repeated weight changes must keep selecting their private bundled fonts.
    rasters: [...expectedRasters, ...expectedRasters],
  });
});
