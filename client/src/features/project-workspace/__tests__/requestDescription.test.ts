import { expect, it } from "vitest";
import { AcceptedRequestSchema, type AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import { CapabilityProfileSchema } from "@shared/schemas/workflow/capability.schemas";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { requestHistoryDescription, requestSettingsDescription } from "../state/requestDescription";

const profile=CapabilityProfileSchema.parse({schemaVersion:"vidra-workflow/v2",id:"captured-profile",revision:"captured-revision",label:"Captured model",action:"make-video",provider:"controlled-ui",endpoint:"not-dispatched",mode:"image-to-video",availability:"qualified",inputs:[],output:{kind:"video",maxCount:1},maxContextCharacters:32000,parameters:{duration:{policy:"editable",defaultValue:10,domain:{kind:"enum",values:[8,10]}},aspectRatio:{policy:"derived",from:"input-aspect",role:"start-frame"}},constraints:[],recovery:{start:"supported",status:"supported",cancel:"unsupported",result:"supported",deadlineSeconds:600},generatedAudio:"always",pricing:{mode:"free",maximumCreditsPerSlot:0}});
function accepted():AcceptedRequest{return AcceptedRequestSchema.parse({schemaVersion:"vidra-workflow/v2",id:"request_captured",ownerId:"owner",projectId:"project_current",conversationId:"conversation_original",submissionId:"submission_captured",executionDraftId:"draft_captured",executionDraftRevision:1,acceptanceSequence:1,snapshotHash:"a".repeat(64),snapshot:{action:"make-video",instructions:"Captured words",inputs:[{state:"resolved",role:"start-frame",versionId:"version_start"}],settings:{profileId:profile.id,profileRevision:profile.revision,parameters:{duration:8,aspectRatio:"16:9",resolution:"720p"},outputCount:1},context:{origin:"empty",requestIds:[],projectInstructionsRevision:1},destination:{projectId:"project_current",conversationId:"conversation_original"}},materializedContext:{projectInstructions:"",entries:[]},slots:[{id:"slot_captured",ordinal:1,outcome:"queued",delivery:"none",usage:{mode:"free",reserved:0,settled:0}}],acceptedAt:"2026-10-18T05:00:00.000Z"});}
const start=MediaVersionSchema.parse({schemaVersion:"vidra-workflow/v2",id:"version_start",ownerId:"owner",projectId:"project_current",kind:"image",label:"Starting image",origin:{kind:"upload"},sourceInputs:[],object:{identity:"unknown",assetId:"start",storagePath:"users/owner/start"},metadata:{state:"verified",width:1920,height:1080,durationSeconds:0,audio:"absent",probeVersion:"controlled-ui"},association:"linked",createdAt:"2026-10-18T05:00:00.000Z"});

it("describes captured settings without substituting newer defaults or changing the snapshot",()=>{
 const request=accepted();const before=JSON.stringify(request);
 expect(requestSettingsDescription(request,profile,[start])).toBe("8 seconds · 16:9 · 720p · sound included");expect(JSON.stringify(request)).toBe(before);
});

it("preserves selected aliases and explicit sound off over catalog sound facts",()=>{
 const request=accepted();request.snapshot.settings.parameters={durationSeconds:1,aspect_ratio:"9:16",resolution:"1080p",audio:false};
 expect(requestSettingsDescription(request,profile,[])).toBe("1 second · 9:16 · 1080p · sound off");
});

it("does not fill omitted selected parameters from current catalog defaults",()=>{
 const request=accepted();request.snapshot.settings.parameters={};
 expect(requestSettingsDescription(request,profile,[])).toBe("sound included");
 expect(requestSettingsDescription(request,undefined,[])).toBe("");
});

it.each([{id:"other-profile",revision:profile.revision},{id:profile.id,revision:"later-revision"}])("uses fixed facts only from the captured profile revision: %j",mismatch=>{
 expect(requestSettingsDescription(accepted(),{...profile,...mismatch},[])).toBe("8 seconds · 16:9 · 720p");
});

it.each([true,false])("retains an explicit captured sound value even when the profile revision is unavailable: %s",sound=>{
 const request=accepted();request.snapshot.settings.parameters.generateAudio=sound;
 expect(requestSettingsDescription(request,{...profile,revision:"later-revision"},[])).toBe(`8 seconds · 16:9 · 720p · ${sound?"sound included":"sound off"}`);
});

it("resolves match-input shape from the declared start-frame role instead of an earlier unrelated reference",()=>{
 const request=accepted();request.snapshot.settings.parameters.aspectRatio="match_input_image";
 const reference=MediaVersionSchema.parse({...start,id:"version_reference",metadata:{state:"verified",width:1080,height:1920,durationSeconds:0,audio:"absent",probeVersion:"controlled-ui"}});
 request.snapshot.inputs.unshift({state:"resolved",role:"reference",versionId:reference.id});
 expect(requestSettingsDescription(request,profile,[reference,start])).toBe("8 seconds · 16:9 · 720p · sound included");
});

it.each(["owner","project"])("never derives a captured input's geometry from a different %s",scope=>{
 const request=accepted();request.snapshot.settings.parameters.aspectRatio="match_input_image";
 const foreign=MediaVersionSchema.parse({...start,...(scope==="owner"?{ownerId:"other-owner"}:{projectId:"project_foreign"}),metadata:{state:"verified",width:1080,height:1920,durationSeconds:0,audio:"absent",probeVersion:"controlled-ui"}});
 expect(requestSettingsDescription(request,profile,[foreign])).toBe("8 seconds · From input · 720p · sound included");
 expect(requestSettingsDescription(request,profile,[foreign,start])).toBe("8 seconds · 16:9 · 720p · sound included");
});

it("uses only the exact historical catalog revision when naming a request",()=>{
 const current={...profile,revision:"later-revision",label:"New current model"};
 expect(requestHistoryDescription(accepted(),[current,profile])).toBe("Make video · Captured model · 16:9 · 8s");
 expect(requestHistoryDescription(accepted(),[current])).toBe("Make video · 16:9 · 8s");
});
