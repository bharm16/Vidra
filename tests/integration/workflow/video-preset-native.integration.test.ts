import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { z } from "zod";

const execute = promisify(execFile);
const root = fileURLToPath(new URL("../../../", import.meta.url));
const moduleUrl = (path: string): string => new URL(`../../../${path}`, import.meta.url).href;
const marker = "__VIDRA_PRESET_NATIVE__";
const MetricsSchema = z.object({ width: z.number(), height: z.number(), capitalBaseline: z.number() });
const ResultSchema = z.object({
  backend: z.string().optional(), fontHash: z.string(), portraitFontSize: z.number(),
  typographyPreserved: z.boolean(), originalAcceptedUnchanged: z.boolean(), oldFileUnchanged: z.boolean(), oldFrameRepeated: z.boolean(),
  legacyCoordinatesUnchanged: z.boolean(), legacyHashUnchanged: z.boolean(), legacyRasterBytesStable: z.boolean(),
  semanticMetadataOnlyKeepsPixels: z.boolean(), previewEqualsCommit: z.boolean(), customHeightPreserved: z.boolean(),
  portraitGeometry: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number(), placement: z.literal("bottom-center") }),
  rejectedBounds: z.array(z.boolean()), rejectedInputsUnchanged: z.boolean(),
  landscape: MetricsSchema, portrait: MetricsSchema,
  exports: z.array(z.object({ width: z.number(), height: z.number(), frames: z.number(), opaqueSamples: z.number(), encodedMeanError: z.number() })),
});

it("reflows explicit caption placement into native portrait output while preserving legacy coordinates and accepted files", async () => {
  // A fresh process reproduces production's startup order before its first Pango
  // map. Other integration files can initialize native libraries independently.
  const directory = await mkdtemp(join(tmpdir(), "vidra-preset-native-test-"));
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "test", TSX_TSCONFIG_PATH: `${root}server/tsconfig.json`, TMPDIR: directory, TMP: directory, TEMP: directory };
  delete env.PANGOCAIRO_BACKEND;
  const source = `
    import ${JSON.stringify(moduleUrl("server/instrument.mjs"))};
    import ${JSON.stringify(moduleUrl("server/src/config/native-fonts.ts"))};
    import { NativeVideoRenderer } from ${JSON.stringify(moduleUrl("server/src/services/video-export/NativeVideoRenderer.ts"))};
    import { rasterizeCaption, videoFontPath } from ${JSON.stringify(moduleUrl("server/src/services/video-export/CaptionRasterizer.ts"))};
    import { hashLocalFile } from ${JSON.stringify(moduleUrl("server/src/services/video-export/ExportStorage.ts"))};
    import { runNative } from ${JSON.stringify(moduleUrl("server/src/services/video-export/NativeProcess.ts"))};
    import { applyEditCommand, validateVideoComposition, withVideoPreset } from ${JSON.stringify(moduleUrl("shared/video-edit/composition.ts"))};
    import { captionPlacement } from ${JSON.stringify(moduleUrl("shared/video-edit/captionPlacement.ts"))};
    import { VideoCompositionSchema, VideoExportSchema } from ${JSON.stringify(moduleUrl("shared/schemas/workflow/video-edit.schemas.ts"))};
    import { MediaVersionSchema } from ${JSON.stringify(moduleUrl("shared/schemas/workflow/media.schemas.ts"))};
    import { canonicalJson } from ${JSON.stringify(moduleUrl("shared/workflow/canonicalJson.ts"))};
    import sharp from "sharp";
    import { copyFile, readFile, rm } from "node:fs/promises";
    import { createHash } from "node:crypto";
    import { join } from "node:path";
    const folder=${JSON.stringify(directory)}, timestamp="2026-10-18T05:00:00.000Z";
    const digest=value=>createHash("sha256").update(value).digest("hex");
    const picture=join(folder,"source.png");
    await sharp({create:{width:640,height:360,channels:3,background:"#123344"}}).png().toFile(picture);
    const media=MediaVersionSchema.parse({schemaVersion:"vidra-workflow/v2",id:"version_still",ownerId:"creator",projectId:"project_preset",kind:"image",label:"Pinned source",origin:{kind:"upload"},sourceInputs:[],object:{identity:"verified",assetId:"asset_still",storagePath:"users/creator/source.png",generation:"1",...await hashLocalFile(picture)},metadata:{state:"verified",width:640,height:360,durationSeconds:0,audio:"absent",probeVersion:"preset-native/v1"},association:"linked",createdAt:timestamp});
    const storage={download:async(owner,version,target)=>{if(owner!=="creator"||version.id!==media.id)throw new Error("Unowned native source");await copyFile(picture,target);},inspect:async()=>undefined,remove:async()=>undefined,store:async()=>{throw new Error("No external storage");},access:async()=>{throw new Error("No external grants");}};
    const renderer=new NativeVideoRenderer(storage);
    const original=VideoCompositionSchema.parse({normalizationVersion:"vidra-cfr30/v1",preset:"landscape",fps:30,items:[{id:"item_still",versionId:media.id,kind:"picture",inFrame:0,outFrame:0,displayFrames:30,fit:"fit",sourceAudio:{muted:true,gain:1}}],text:[{id:"caption",text:"Make room for evening.",anchor:{kind:"item",itemId:"item_still"},startFrame:0,endFrame:30,x:.056816,y:.868692,width:.886364,height:.12,fontSize:43.636,fontWeight:500,fontFamily:"Inter",letterSpacingEm:0,lineHeightEm:1.3,color:"#F7F7F7",align:"center"}]});
    const accepted=VideoExportSchema.parse({schemaVersion:"vidra-workflow/v2",id:"export_before_preset",ownerId:"creator",projectId:"project_preset",editId:"edit_preset",revision:1,submissionId:"submission_before_preset",executionDraftId:"draft_before_preset",executionDraftRevision:1,composition:original,compositionHash:digest(canonicalJson(original)),sources:[media],renderer:await renderer.fingerprint(),attemptId:"attempt_before_preset",state:"rendering",progress:0,createdAt:timestamp,updatedAt:timestamp});
    const captured=canonicalJson(accepted);
    // The legacy cue deliberately coincides with the old Bottom centre numbers.
    // Intent is introduced only by this explicit Position editing action.
    const marked=applyEditCommand(original,{kind:"text",text:{...original.text[0],...captionPlacement("landscape","bottom-center"),placement:"bottom-center"}});
    const format={kind:"preset",preset:"portrait",fits:[{itemId:"item_still",fit:"fit"}]};
    const next=applyEditCommand(marked,format),legacyNext=applyEditCommand(original,format);
    const geometry=cue=>({x:cue.x,y:cue.y,width:cue.width,height:cue.height});
    const legacyCoordinatesUnchanged=canonicalJson(geometry(original.text[0]))===canonicalJson(geometry(legacyNext.text[0]))&&!("placement"in legacyNext.text[0]);
    const roundTripLegacy=VideoExportSchema.parse(JSON.parse(captured));
    const legacyHashUnchanged=digest(canonicalJson(roundTripLegacy.composition))===accepted.compositionHash&&!("placement"in roundTripLegacy.composition.text[0]);
    const customHeight={...marked,text:[{...marked.text[0],height:.1}]};
    const customHeightPreserved=applyEditCommand(customHeight,format).text[0].height===.1;
    if(validateVideoComposition(original,[media]).length||validateVideoComposition(next,[media]).length)throw new Error("Invalid native fixture");
    const newer=VideoExportSchema.parse({...accepted,id:"export_after_preset",revision:2,submissionId:"submission_after_preset",executionDraftId:"draft_after_preset",attemptId:"attempt_after_preset",composition:next,compositionHash:digest(canonicalJson(next))});
    const rejectedBounds=[];let rejectedInputsUnchanged=true;
    for(const[preset,target,size]of[["landscape","portrait",240],["portrait","landscape",12]]){const value=VideoCompositionSchema.parse({...original,preset,text:[{...original.text[0],fontSize:size}]});const before=canonicalJson(value);try{applyEditCommand(value,{kind:"preset",preset:target,fits:[{itemId:"item_still",fit:"fill"}]});rejectedBounds.push(false);}catch(e){rejectedBounds.push(e.message.includes("supported size range"));}rejectedInputsUnchanged&&=before===canonicalJson(value);}
    const results=[],outputs=[];let firstHash,firstFrame;
    const metrics=async(cue,preset)=>{const raster=await rasterizeCaption(cue,preset);const{data,info}=await sharp(raster.png).raw().toBuffer({resolveWithObject:true});let left=info.width,right=-1,top=info.height,bottom=-1;for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>16){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}let capitalBottom=-1;for(let y=0;y<info.height;y++)for(let x=left;x<=left+Math.round(cue.fontSize*.12);x++)if(data[(y*info.width+x)*4+3]>16)capitalBottom=Math.max(capitalBottom,y);const height=preset==="portrait"?1920:1080;return{raster,data,info,relative:{width:(right-left+1)*520/height,height:(bottom-top+1)*520/height,capitalBaseline:(raster.y+capitalBottom)*520/height}};};
    const landscape=await metrics(original.text[0],"landscape"),portrait=await metrics(next.text[0],"portrait");
    const semanticLandscape=await rasterizeCaption(marked.text[0],"landscape");
    const semanticMetadataOnlyKeepsPixels=semanticLandscape.png.equals(landscape.raster.png);
    const legacyTypography={...original.text[0]};delete legacyTypography.fontFamily;delete legacyTypography.letterSpacingEm;delete legacyTypography.lineHeightEm;
    const legacyBefore=await rasterizeCaption(legacyTypography,"landscape"),legacyAfter=await rasterizeCaption({...legacyTypography,placement:"bottom-center"},"landscape");
    const legacyRasterBytesStable=legacyBefore.png.equals(legacyAfter.png);
    try{
      for(const[index,record]of[accepted,newer,accepted].entries()){
        const result=await renderer.render(record,new AbortController().signal,()=>undefined);outputs.push(result);
        const framePath=join(folder,"frame-"+index+".png");await runNative("ffmpeg",["-v","error","-nostdin","-y","-ss","0.2","-i",result.localPath,"-frames:v","1",framePath],{timeoutMs:15000});
        const frame=await sharp(framePath).removeAlpha().raw().toBuffer({resolveWithObject:true});const text=index===1?portrait:landscape;let best=Infinity,opaqueSamples=0;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){let error=0,count=0;for(let y=0;y<text.info.height;y++)for(let x=0;x<text.info.width;x++){const r=(y*text.info.width+x)*4;if(text.data[r+3]<252)continue;const f=((text.raster.y+y+dy)*frame.info.width+text.raster.x+x+dx)*3;for(let c=0;c<3;c++)error+=Math.abs(frame.data[f+c]-text.data[r+c]);count++;}opaqueSamples=count;best=Math.min(best,error/(count*3));}
        results.push({width:result.width,height:result.height,frames:result.frames,opaqueSamples,encodedMeanError:best});
        if(index===0){firstHash=await hashLocalFile(result.localPath);firstFrame=digest(frame.data);}else if(index===2)results.oldFrameRepeated=firstFrame===digest(frame.data);
      }
      const oldFileUnchanged=canonicalJson(firstHash)===canonicalJson(await hashLocalFile(outputs[0].localPath));
      const positioned=next.text[0];
      process.stdout.write(${JSON.stringify(marker)}+JSON.stringify({backend:process.env.PANGOCAIRO_BACKEND,fontHash:digest(await readFile(videoFontPath(500,"Inter"))),portraitFontSize:positioned.fontSize,typographyPreserved:canonicalJson({...marked.text[0],...geometry(positioned),fontSize:positioned.fontSize})===canonicalJson(positioned),portraitGeometry:{...geometry(positioned),placement:positioned.placement},legacyCoordinatesUnchanged,legacyHashUnchanged,legacyRasterBytesStable,semanticMetadataOnlyKeepsPixels,previewEqualsCommit:canonicalJson(withVideoPreset(marked,"portrait"))===canonicalJson(next),customHeightPreserved,originalAcceptedUnchanged:captured===canonicalJson(accepted),oldFileUnchanged,oldFrameRepeated:results.oldFrameRepeated,rejectedBounds,rejectedInputsUnchanged,landscape:landscape.relative,portrait:portrait.relative,exports:results}));
    }finally{for(const output of outputs)await rm(output.directory,{recursive:true,force:true});}
  `;
  try {
    const { stdout } = await execute(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", source], { cwd: root, env, timeout: 150_000, maxBuffer: 256 * 1024 });
    const line = stdout.split("\n").find(row => row.startsWith(marker));
    if (!line) throw new Error("The isolated native preset probe returned no evidence.");
    const result = ResultSchema.parse(JSON.parse(line.slice(marker.length)));
    expect(result).toMatchObject({ fontHash: "97ad806f526e41546d46365bb3a393145f75b7b1568913db74549ad8b8dba872", portraitFontSize: 77.575111, typographyPreserved: true, legacyCoordinatesUnchanged: true, legacyHashUnchanged: true, legacyRasterBytesStable: true, semanticMetadataOnlyKeepsPixels: true, previewEqualsCommit: true, customHeightPreserved: true, originalAcceptedUnchanged: true, oldFileUnchanged: true, oldFrameRepeated: true, rejectedBounds: [true, true], rejectedInputsUnchanged: true });
    // Source E12/E13's logical anchor and width belong to the output canvas.
    expect(result.portraitGeometry).toEqual({ x: (1 - 263.169 / 292.644) / 2, y: 452.65 / 520, width: 263.169 / 292.644, height: .12, placement: "bottom-center" });
    if (process.platform === "darwin") expect(result.backend).toBe("fontconfig");
    expect(result.exports.map(row => [row.width, row.height, row.frames])).toEqual([[1920, 1080, 30], [1080, 1920, 30], [1920, 1080, 30]]);
    for (const output of result.exports) { expect(output.opaqueSamples).toBeGreaterThan(1000); expect(output.encodedMeanError).toBeLessThan(12); }
    expect(result.landscape.width).toBeGreaterThan(230);
    expect(result.landscape.width).toBeLessThan(238);
    expect(Math.abs(result.landscape.width - result.portrait.width)).toBeLessThan(1);
    expect(Math.abs(result.landscape.height - result.portrait.height)).toBeLessThan(1);
    // The bottom of the first capital's stem measures the painted baseline,
    // without confusing the caption box top with actual glyph placement.
    const expectedBaselineShift = (452.65 / 520 - .868692) * 520;
    expect(Math.abs(result.landscape.capitalBaseline + expectedBaselineShift - result.portrait.capitalBaseline)).toBeLessThan(1);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 180_000);
