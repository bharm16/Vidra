import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { z } from "zod";

const execute = promisify(execFile);
const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const startup = new URL("../../../config/native-fonts.ts", import.meta.url).href;
const rasterizer = new URL("../CaptionRasterizer.ts", import.meta.url).href;
const schema = new URL("../../../../../shared/schemas/workflow/video-edit.schemas.ts", import.meta.url).href;
const marker = "__CAPTION_TYPOGRAPHY__";

async function probe(body: string): Promise<unknown> {
  const temporary = await mkdtemp(join(tmpdir(), "vidra-caption-test-"));
  const env: NodeJS.ProcessEnv = { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary, NODE_ENV: "test", TSX_TSCONFIG_PATH: `${root}server/tsconfig.json` };
  delete env.PANGOCAIRO_BACKEND;
  const source = `import ${JSON.stringify(startup)};
    import { rasterizeCaption, videoFontPath, fontFingerprint } from ${JSON.stringify(rasterizer)};
    import { VideoTextSchema } from ${JSON.stringify(schema)};
    import sharp from "sharp";
    import { createHash } from "node:crypto";
    import { readFile, readdir } from "node:fs/promises";
    import { tmpdir } from "node:os";
    const base = VideoTextSchema.parse({ id:"caption", text:"Make room for evening.", anchor:{kind:"composition"},startFrame:0,endFrame:30,x:0,y:0,width:.93296,height:.3,fontSize:69.72067,fontWeight:500,color:"#f7f7f7",align:"center" });
    const digest = bytes => createHash("sha256").update(bytes).digest("hex");
    const ink = async png => { const { data, info } = await sharp(png).raw().toBuffer({resolveWithObject:true});let left=info.width,right=-1,top=info.height,bottom=-1;const bands=[];for(let y=0;y<info.height;y++){let occupied=false;for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>16){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);occupied=true;}if(occupied){const last=bands.at(-1);if(last&&last[1]===y-1)last[1]=y;else bands.push([y,y]);}}return{left,top,width:right-left+1,height:bottom-top+1,bands};};
    ${body}
  `;
  try {
    const { stdout } = await execute(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", source], { cwd: root, env, timeout: 30_000, maxBuffer: 128 * 1024 });
    const row = stdout.split("\n").find(line => line.startsWith(marker));
    if (!row) throw new Error("The native typography probe did not return evidence.");
    const value: unknown = JSON.parse(row.slice(marker.length));
    return value;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

it("uses all exact bundled faces, stable repeated shaping and source-derived tracking", async () => {
  const result = await probe(`
    const rows = [];
    for(const family of ["Inter","Figtree"])for(const weight of [400,500,600,500]){
      const raster=await rasterizeCaption({...base,fontFamily:family,fontWeight:weight,letterSpacingEm:family==="Figtree"?.01:0,lineHeightEm:18/13},"landscape");
      rows.push({family,weight,fontHash:digest(await readFile(videoFontPath(weight,family))),pngHash:digest(raster.png),ink:await ink(raster.png)});
    }
    const plain=await rasterizeCaption({...base,fontFamily:"Figtree",letterSpacingEm:0,lineHeightEm:18/13},"landscape");
    const first=await fontFingerprint(),second=await fontFingerprint();
    console.log(${JSON.stringify(marker)}+JSON.stringify({
      stable:rows[1].pngHash===rows[3].pngHash&&rows[5].pngHash===rows[7].pngHash,
      distinct: new Set(rows.filter(r=>r.weight===500).map(r=>r.pngHash)).size===2,
      mediumFigtreeHash:rows[5].fontHash,
      mediumInterHash:rows[1].fontHash,
      figtreeWidth:rows[5].ink.width,interWidth:rows[1].ink.width,plainWidth:(await ink(plain.png)).width,
      leading:rows[5].ink.top,
      fingerprintStable:first===second,
      sixFontHashes: new Set(rows.map(r=>r.fontHash)).size
    }));
  `);
  expect(result).toMatchObject({ stable: true, distinct: true, fingerprintStable: true, sixFontHashes: 6, mediumFigtreeHash: "f8a90c01bc4c31aa84be5cbff3e80784bfc0da37e5aaa23eb9e05108b9ba0ece", mediumInterHash: "97ad806f526e41546d46365bb3a393145f75b7b1568913db74549ad8b8dba872" });
  expect(result).toMatchObject({ figtreeWidth: expect.any(Number), interWidth: expect.any(Number), plainWidth: expect.any(Number), leading: expect.any(Number) });
  const values = z.object({ figtreeWidth: z.number(), interWidth: z.number(), plainWidth: z.number(), leading: z.number() }).parse(result);
  expect(values.figtreeWidth).toBeGreaterThan(values.plainWidth + 10);
  expect(values.interWidth).toBeGreaterThan(values.figtreeWidth + 20);
  expect(values.leading).toBeGreaterThanOrEqual(20);
  expect(values.leading).toBeLessThanOrEqual(23);
});

it("retains full leading and multiline height, supports tiny glyphs, and cleans native intermediates", async () => {
  const result = await probe(`
    const before=(await readdir(tmpdir())).filter(n=>n.startsWith("vidra-caption-layout-")).sort();
    const two=await rasterizeCaption({...base,text:base.text+String.fromCharCode(10)+base.text,fontFamily:"Figtree",letterSpacingEm:.01,lineHeightEm:18/13},"landscape");
    const first=await ink(two.png);
    const tiny=await rasterizeCaption({...base,text:".",fontSize:12,fontWeight:400,fontFamily:"Figtree",lineHeightEm:1.5},"landscape");
    const after=(await readdir(tmpdir())).filter(n=>n.startsWith("vidra-caption-layout-")).sort();
    console.log(${JSON.stringify(marker)}+JSON.stringify({two:first, tiny:await ink(tiny.png), cleanup:JSON.stringify(before)===JSON.stringify(after)}));
  `);
  expect(result).toMatchObject({ cleanup: true, two: { bands: expect.any(Array) }, tiny: { width: 2, height: 2, top: 12 } });
  const values = z.object({ two: z.object({ bands: z.array(z.tuple([z.number(), z.number()])) }) }).parse(result);
  expect(values.two.bands).toHaveLength(2);
  const first = values.two.bands[0]?.[0]; const second = values.two.bands[1]?.[0];
  expect(first).toBeGreaterThan(0);
  expect((second ?? 0) - (first ?? 0)).toBeGreaterThanOrEqual(96);
  expect((second ?? 0) - (first ?? 0)).toBeLessThanOrEqual(97);
});

it("preserves the legacy Inter PNG exactly when typography fields are absent", async () => {
  const result = await probe(`
    const old=async cue=>{const output=await sharp({text:{text:'<span foreground="'+cue.color+'">'+cue.text+'</span>',fontfile:videoFontPath(cue.fontWeight),font:'Inter Medium '+cue.fontSize,width:Math.round(1920*cue.width),dpi:72,align:cue.align,wrap:"word-char",rgba:true}}).png().toBuffer({resolveWithObject:true});return sharp({create:{width:Math.round(1920*cue.width),height:Math.round(1080*cue.height),channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:output.data,left:Math.floor((Math.round(1920*cue.width)-output.info.width)/2),top:0}]).png().toBuffer();};
    const expected=await old(base),before=await rasterizeCaption(base,"landscape");
    await rasterizeCaption({...base,fontFamily:"Figtree",letterSpacingEm:.01,lineHeightEm:18/13},"landscape");
    const after=await rasterizeCaption(base,"landscape");
    console.log(${JSON.stringify(marker)}+JSON.stringify({before:expected.equals(before.png),after:expected.equals(after.png),legacyLeading:(await ink(after.png)).top,absence:!("fontFamily"in base)&&!("letterSpacingEm"in base)&&!("lineHeightEm"in base)}));
  `);
  expect(result).toEqual({ before: true, after: true, legacyLeading: 0, absence: true });
});

it("rejects unsupported glyphs, invalid metrics and actual overflow without fallback or leaked files", async () => {
  const result = await probe(`
    const before=(await readdir(tmpdir())).filter(n=>n.startsWith("vidra-caption-layout-")).sort();const errors=[];
    for(const patch of [{text:"🦊"},{lineHeightEm:NaN},{letterSpacingEm:Infinity},{fontFamily:"system"},{text:"Too many words ".repeat(8),width:.03,height:.01},{x:.9,width:.9}]){
      try{await rasterizeCaption({...base,fontFamily:"Figtree",lineHeightEm:18/13,...patch},"landscape");errors.push("accepted");}catch(e){errors.push(e.message);}
    }
    const literal=await rasterizeCaption({...base,text:"<b>M</b>",fontFamily:"Figtree",lineHeightEm:18/13},"landscape");
    const after=(await readdir(tmpdir())).filter(n=>n.startsWith("vidra-caption-layout-")).sort();
    console.log(${JSON.stringify(marker)}+JSON.stringify({errors,literalWidth:(await ink(literal.png)).width,cleanup:JSON.stringify(before)===JSON.stringify(after)}));
  `);
  expect(result).toMatchObject({ errors: [expect.stringContaining("does not support"), expect.stringContaining("supported bounds"), expect.stringContaining("supported bounds"), expect.stringContaining("font is unavailable"), expect.stringContaining("overflow"), expect.stringContaining("overflow")], cleanup: true });
  expect(z.object({ literalWidth: z.number() }).parse(result).literalWidth).toBeGreaterThan(200);
});
