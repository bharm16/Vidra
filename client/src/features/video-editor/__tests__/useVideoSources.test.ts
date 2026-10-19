import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { useVideoSources } from "../hooks/useVideoSources";

const clip=MediaVersionSchema.parse({schemaVersion:"vidra-workflow/v2",id:"version_clip",ownerId:"creator",projectId:"project_one",kind:"video",label:"Clip",origin:{kind:"upload"},sourceInputs:[],object:{identity:"verified",assetId:"clip",storagePath:"users/creator/clip.mp4",generation:"1",sha256:"a".repeat(64),bytes:100},metadata:{state:"verified",width:1920,height:1080,durationSeconds:4,audio:"present",probeVersion:"controlled"},association:"linked",createdAt:"2026-10-17T00:00:00.000Z"});
const picture=MediaVersionSchema.parse({...clip,id:"version_picture",kind:"image",label:"Picture",metadata:{...clip.metadata,durationSeconds:0,audio:"absent"}});

it("adding a picture to an edit does not reopen or refetch an unchanged clip",async()=>{
 const access=vi.fn(async(id:string)=>({url:`https://owned.example/${id}`}));
 const {result,rerender}=renderHook(({normalized})=>useVideoSources([clip,picture],access,"creator:project_one",normalized),{initialProps:{normalized:"version_clip"}});
 await waitFor(()=>expect(result.current.sources.version_clip?.loading).toBe(false));expect(access).toHaveBeenCalledTimes(2);
 rerender({normalized:"version_clip|version_picture"});
 expect(result.current.sources.version_clip).toEqual({url:"https://owned.example/version_clip",loading:false});
 await act(async()=>Promise.resolve());expect(access).toHaveBeenCalledTimes(2);
});

it("a late original-access reply cannot replace the normalized preview selected for the edit",async()=>{
 let resolveOriginal:((value:{url:string})=>void)|undefined;
 const original=new Promise<{url:string}>(resolve=>{resolveOriginal=resolve;});
 const access=vi.fn().mockImplementationOnce(()=>original).mockResolvedValue({url:"https://owned.example/normalized.mp4",frames:120});
 const {result,rerender}=renderHook(({normalized})=>useVideoSources([clip],access,"creator:project_one",normalized),{initialProps:{normalized:""}});
 await waitFor(()=>expect(access).toHaveBeenCalledTimes(1));rerender({normalized:"version_clip"});
 await waitFor(()=>expect(result.current.sources.version_clip?.url).toBe("https://owned.example/normalized.mp4"));
 await act(async()=>{resolveOriginal?.({url:"https://owned.example/original.mov"});await original;});
 expect(result.current.sources.version_clip).toEqual({url:"https://owned.example/normalized.mp4",frames:120,loading:false});
});
