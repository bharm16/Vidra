import { expect, it } from "vitest";
import { runNative, RenderCancelledError } from "../NativeProcess";
import { rasterizeCaption } from "../CaptionRasterizer";
import { VideoTextSchema } from "@shared/schemas/workflow/video-edit.schemas";

it("waits for process close before confirming native cancellation", async () => { const controller = new AbortController(); const start = Date.now(); const promise = runNative(process.execPath, ["-e", "process.on('SIGTERM',()=>setTimeout(()=>process.exit(0),150));process.stdout.write('ready');setInterval(()=>{},1000)"], { timeoutMs: 5000, signal: controller.signal, onProgress: chunk => { if (chunk.includes("ready")) controller.abort(); } }); await expect(promise).rejects.toBeInstanceOf(RenderCancelledError); expect(Date.now() - start).toBeGreaterThanOrEqual(140); });
it("reports a missing executable and a process deadline as failures", async () => { await expect(runNative("/missing/vidra/ffmpeg", [], { timeoutMs: 100 })).rejects.toMatchObject({ code: "ENOENT" }); await expect(runNative(process.execPath, ["-e", "setInterval(()=>{},1000)"], { timeoutMs: 50 })).rejects.toThrow("deadline"); });
it("renders markup as literal text using bundled fonts, refuses overflow and missing glyphs", async () => { const cue = VideoTextSchema.parse({ id: "caption", text: "<script> & words", anchor: { kind: "composition" }, startFrame: 0, endFrame: 30, x: 0.1, y: 0.1, width: 0.8, height: 0.2, fontSize: 36, fontWeight: 500, color: "#ffffff", align: "center" }); const raster = await rasterizeCaption(cue, "landscape"); expect(raster.png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a"); await expect(rasterizeCaption({ ...cue, text: "Too many words ".repeat(200), width: 0.05, height: 0.01 }, "landscape")).rejects.toThrow("overflow"); await expect(rasterizeCaption({ ...cue, text: "🦊" }, "landscape")).rejects.toThrow("does not support"); });

it("renders fractional output-pixel caption sizes without rounding to an integer", async () => {
 const cue=VideoTextSchema.parse({id:"fractional_caption",text:"Make room for evening.",anchor:{kind:"composition"},startFrame:0,endFrame:30,x:.05,y:.8,width:.9,height:.15,fontSize:43.636,fontWeight:500,color:"#f7f7f7",align:"center"});
 const fractional=await rasterizeCaption(cue,"landscape");
 for(const integer of [43,44]){
  const rounded=await rasterizeCaption({...cue,fontSize:integer},"landscape");
  expect(fractional.png.equals(rounded.png)).toBe(false);
 }
});

it("terminates a process that exceeds its RSS bound and waits for closure", async () => { await expect(runNative(process.execPath, ["-e", "const bytes=Buffer.alloc(64*1024*1024,1);setInterval(()=>process.stdout.write(String(bytes[0])),1000)"], { timeoutMs: 5000, maxRssBytes: 16 * 1024 * 1024 })).rejects.toThrow("memory limit"); });
