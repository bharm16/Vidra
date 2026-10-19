import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AcceptedRequestSchema, type AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import { CapabilityProfileSchema } from "@shared/schemas/workflow/capability.schemas";
import { MediaVersionSchema, type MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { RequestDetails } from "../components/RequestDetails";
import { MediaViewer } from "../components/MediaViewer";

const at="2026-10-18T05:00:00.000Z";
const words="A runner on a floodlit track. Keep the camera low and the stadium lights cool.";
const profile=CapabilityProfileSchema.parse({schemaVersion:"vidra-workflow/v2",id:"captured-profile",revision:"captured-revision",label:"Veo 3.1",action:"make-video",provider:"controlled-ui",endpoint:"not-dispatched",mode:"image-to-video",availability:"qualified",inputs:[{role:"start-frame",kinds:["image"],minCount:1,maxCount:1}],output:{kind:"video",maxCount:1},maxContextCharacters:32000,parameters:{},constraints:[],recovery:{start:"supported",status:"supported",cancel:"unsupported",result:"supported",deadlineSeconds:600},generatedAudio:"always",pricing:{mode:"free",maximumCreditsPerSlot:0}});
const input=MediaVersionSchema.parse({schemaVersion:"vidra-workflow/v2",id:"version_start",ownerId:"owner",projectId:"project_current",kind:"image",label:"Stadium · v1",origin:{kind:"upload"},sourceInputs:[],object:{identity:"unknown",assetId:"start",storagePath:"users/owner/start"},metadata:{state:"verified",width:1920,height:1080,durationSeconds:0,audio:"absent",probeVersion:"controlled-ui"},association:"linked",createdAt:at});
const result=MediaVersionSchema.parse({...input,id:"version_result",kind:"video",label:"Stadium clip · v2",origin:{kind:"generated",requestId:"request_original",slotId:"slot_original"},metadata:{state:"verified",width:1920,height:1080,durationSeconds:8,audio:"present",probeVersion:"controlled-ui"}});
function accepted():AcceptedRequest{return AcceptedRequestSchema.parse({schemaVersion:"vidra-workflow/v2",id:"request_original",ownerId:"owner",projectId:"project_current",conversationId:"conversation_original",submissionId:"submission_original",executionDraftId:"draft_original",executionDraftRevision:3,acceptanceSequence:2,snapshotHash:"a".repeat(64),snapshot:{action:"make-video",instructions:words,inputs:[{state:"resolved",role:"start-frame",versionId:input.id}],settings:{profileId:profile.id,profileRevision:profile.revision,parameters:{duration:8,aspectRatio:"16:9",resolution:"720p"},outputCount:1},context:{origin:"empty",requestIds:[],projectInstructionsRevision:1},destination:{projectId:"project_current",conversationId:"conversation_original"}},materializedContext:{projectInstructions:"Captured project instructions",entries:[]},slots:[{id:"slot_original",ordinal:1,outcome:"completed",delivery:"ready",versionId:result.id,usage:{mode:"free",reserved:0,settled:0}}],acceptedAt:at});}
function freeze(value:unknown):void{if(value&&typeof value==="object"){Object.values(value).forEach(freeze);Object.freeze(value);}}
function rows():Record<string,string>{return Object.fromEntries([...document.querySelectorAll(".vf-request-details dt")].map(term=>[term.textContent??"",term.nextElementSibling?.textContent??""]));}
const destination={projectName:"Evening campaign",conversationName:"First ideas"};
afterEach(()=>{cleanup();vi.clearAllMocks();});

it("opens W37 from the viewer using only the accepted snapshot and leaves working words untouched",async()=>{
 const request=accepted();const captured=JSON.stringify(request);freeze(request);freeze(input);freeze(profile);
 const onReuse=vi.fn(),onClose=vi.fn(),onUseInput=vi.fn(),onReuseSetup=vi.fn();
 render(<><textarea aria-label="Current request words" defaultValue="Unsent working words with a different model and setup"/><MediaViewer version={result} access={async()=>({url:"/controlled-result.mp4"})} onUseInput={onUseInput} onReuseSetup={onReuseSetup} canReuseSetup renderRequestDetails={close=><RequestDetails request={request} result={result} media={[input]} profile={profile} {...destination} onReuse={onReuse} onClose={()=>{onClose();close();}}/>}/></>);
 await waitFor(()=>expect(document.querySelector("video.vf-media-display")).toHaveAttribute("src","/controlled-result.mp4"));
 fireEvent.change(screen.getByRole("textbox",{name:"Current request words"}),{target:{value:"Newer unsent words must remain in the composer"}});
 fireEvent.click(screen.getByRole("button",{name:"Media details"}));
 expect(rows()).toEqual({Words:words,Input:"Stadium · v1 — starting image",Model:"Veo 3.1",Settings:"8 seconds · 16:9 · 720p · sound included",Destination:"Evening campaign / First ideas",Result:"Stadium clip · v2"});
 expect(onReuse).not.toHaveBeenCalled();expect(onUseInput).not.toHaveBeenCalled();expect(onReuseSetup).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Close details"}));
 expect(onClose).toHaveBeenCalledOnce();expect(onReuse).not.toHaveBeenCalled();
 expect(screen.getByRole("textbox",{name:"Current request words"})).toHaveValue("Newer unsent words must remain in the composer");
 expect(JSON.stringify(request)).toBe(captured);
});

it("reuses the exact inspected request only after the explicit action",()=>{
 const request=accepted();const onReuse=vi.fn();
 render(<RequestDetails request={request} result={result} media={[input]} profile={profile} {...destination} onReuse={onReuse} onClose={vi.fn()}/>);
 expect(onReuse).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Reuse setup"}));
 expect(onReuse).toHaveBeenCalledOnce();expect(onReuse.mock.calls[0]?.[0]).toBe(request);
});

it("keeps inspection available but makes reuse inert in read-only work",()=>{
 const onReuse=vi.fn(),onClose=vi.fn();render(<RequestDetails request={accepted()} result={result} media={[input]} profile={profile} {...destination} readOnly onReuse={onReuse} onClose={onClose}/>);
 expect(screen.getByRole("region",{name:"Request details"})).toBeVisible();expect(screen.getByRole("button",{name:"Reuse setup"})).toBeDisabled();
 fireEvent.click(screen.getByRole("button",{name:"Reuse setup"}));expect(onReuse).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Close details"}));expect(onClose).toHaveBeenCalledOnce();
});

it("omits absent inputs rather than manufacturing a starting image from the result",()=>{
 const request=accepted();request.snapshot.inputs=[];
 render(<RequestDetails request={request} result={result} media={[input]} profile={profile} {...destination} onReuse={vi.fn()} onClose={vi.fn()}/>);
 expect(rows().Input).toBeUndefined();expect(screen.queryByText(/starting image/)).not.toBeInTheDocument();
});

it.each([{id:"other-profile",revision:profile.revision},{id:profile.id,revision:"later-revision"}])("does not borrow model names or sound facts from a different profile revision: %j",mismatch=>{
 render(<RequestDetails request={accepted()} result={result} media={[input]} profile={{...profile,...mismatch,label:"Unrelated current model"}} {...destination} onReuse={vi.fn()} onClose={vi.fn()}/>);
 expect(rows().Model).toBe(profile.id);expect(rows().Settings).toBe("8 seconds · 16:9 · 720p");expect(screen.queryByText("Unrelated current model")).not.toBeInTheDocument();
});

it.each(["owner","project"])("never labels an input using a different %s's media",scope=>{
 const foreign=MediaVersionSchema.parse({...input,label:"Private foreign input",...(scope==="owner"?{ownerId:"other-owner"}:{projectId:"project_foreign"})});
 render(<RequestDetails request={accepted()} result={result} media={[foreign]} profile={profile} {...destination} onReuse={vi.fn()} onClose={vi.fn()}/>);
 expect(rows().Input).toBe("Unavailable input — starting image");expect(screen.queryByText(/Private foreign input/)).not.toBeInTheDocument();
});

const invalidResults:Array<{name:string;change:(value:MediaVersion)=>MediaVersion}>=[
 {name:"owner",change:value=>MediaVersionSchema.parse({...value,ownerId:"other-owner"})},
 {name:"project",change:value=>MediaVersionSchema.parse({...value,projectId:"project_foreign"})},
 {name:"request",change:value=>MediaVersionSchema.parse({...value,origin:{kind:"generated",requestId:"request_other",slotId:"slot_original"}})},
 {name:"slot",change:value=>MediaVersionSchema.parse({...value,origin:{kind:"generated",requestId:"request_original",slotId:"slot_other"}})},
 {name:"version",change:value=>MediaVersionSchema.parse({...value,id:"version_other"})},
 {name:"non-generated origin",change:value=>MediaVersionSchema.parse({...value,origin:{kind:"upload"}})},
];
it.each(invalidResults)("rejects a result whose $name does not belong to the accepted output",({change})=>{
 const onReuse=vi.fn();const{container}=render(<RequestDetails request={accepted()} result={change(result)} media={[input]} profile={profile} {...destination} onReuse={onReuse} onClose={vi.fn()}/>);
 expect(container).toBeEmptyDOMElement();expect(onReuse).not.toHaveBeenCalled();
});

it("removes a previously inspected request when the selected result no longer matches",()=>{
 const request=accepted();const onReuse=vi.fn();const props={request,media:[input],profile,...destination,onReuse,onClose:vi.fn()};
 const{rerender}=render(<RequestDetails {...props} result={result}/>);expect(screen.getByRole("button",{name:"Reuse setup"})).toBeEnabled();
 rerender(<RequestDetails {...props} result={MediaVersionSchema.parse({...result,origin:{kind:"generated",requestId:"request_other",slotId:"slot_original"}})}/>);
 expect(screen.queryByRole("region",{name:"Request details"})).not.toBeInTheDocument();expect(onReuse).not.toHaveBeenCalled();
});

it("updates the reuse action to the exact newly selected request without keeping the old closure",()=>{
 const first=accepted();
 const next=AcceptedRequestSchema.parse({...first,id:"request_next",snapshot:{...first.snapshot,instructions:"Different captured words"},slots:[{...first.slots[0],id:"slot_next",versionId:"version_next"}]});
 const nextResult=MediaVersionSchema.parse({...result,id:"version_next",origin:{kind:"generated",requestId:next.id,slotId:"slot_next"}});
 const onReuse=vi.fn();const props={media:[input],profile,...destination,onReuse,onClose:vi.fn()};
 const{rerender}=render(<RequestDetails {...props} request={first} result={result}/>);
 const reuse=screen.getByRole("button",{name:"Reuse setup"});
 rerender(<RequestDetails {...props} request={next} result={nextResult}/>);
 expect(rows().Words).toBe(next.snapshot.instructions);expect(onReuse).not.toHaveBeenCalled();
 fireEvent.click(reuse);expect(onReuse.mock.calls[0]?.[0]).toBe(next);
});

it("does not derive shape from a foreign input even when its id matches the accepted snapshot",()=>{
 const request=accepted();request.snapshot.settings.parameters.aspectRatio="match_input_image";
 const foreign=MediaVersionSchema.parse({...input,ownerId:"other-owner",label:"Private portrait",metadata:{...input.metadata,state:"verified",width:1080,height:1920,durationSeconds:0,audio:"absent",probeVersion:"controlled-ui"}});
 render(<RequestDetails request={request} result={result} media={[foreign]} profile={profile} {...destination} onReuse={vi.fn()} onClose={vi.fn()}/>);
 expect(rows().Input).toBe("Unavailable input — starting image");expect(rows().Settings).toBe("8 seconds · From input · 720p · sound included");
});
