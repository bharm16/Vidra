import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VideoCompositionSchema, VideoTextSchema } from "@shared/schemas/workflow/video-edit.schemas";
import { CaptionControls, CaptionTimingControls, FramingControls } from "../components/EditorPanels";
import { TimingRepair } from "../components/TimingRepair";
import { createCaption } from "../state/editorState";

const originalScroll=Object.getOwnPropertyDescriptor(HTMLElement.prototype,"scrollIntoView");
beforeEach(()=>{Object.defineProperty(HTMLElement.prototype,"scrollIntoView",{configurable:true,value:vi.fn()});});
afterEach(()=>{if(originalScroll)Object.defineProperty(HTMLElement.prototype,"scrollIntoView",originalScroll);else Reflect.deleteProperty(HTMLElement.prototype,"scrollIntoView");});

const composition = VideoCompositionSchema.parse({normalizationVersion:"vidra-cfr30/v1",preset:"landscape",fps:30,items:["one","two","three"].map(id=>({id,versionId:`version_${id}`,kind:"clip",inFrame:0,outFrame:60,displayFrames:60,fit:"fit",sourceAudio:{muted:false,gain:1}})),text:[]});

it("matches the rendered caption reference using fractional output pixels without changing existing sizes",()=>{
 const created=createCaption(composition,composition.items[0]);
 expect(created.fontSize*924.444/1920).toBeCloseTo(21.010,3);
 const existing={...created,fontSize:32};const command=vi.fn();
 render(<CaptionControls caption={existing} composition={composition} disabled={false} command={command} />);
 const size=screen.getByRole("spinbutton",{name:"Caption size"});
 expect(size).toHaveValue(32);expect(size).toHaveAttribute("title","Font size in exported video pixels");
 fireEvent.blur(size);expect(command).not.toHaveBeenCalled();
 fireEvent.change(size,{target:{value:"37.625"}});fireEvent.blur(size);
 expect(command).toHaveBeenCalledWith({kind:"text",text:{...existing,fontSize:37.625}});
 command.mockClear();fireEvent.change(size,{target:{value:""}});fireEvent.blur(size);
 expect(command).not.toHaveBeenCalled();expect(size).toHaveValue(32);
});

it("shows a fractional caption size as whole pixels and keeps its saved precision until the size is changed",()=>{
 const caption=createCaption(composition,composition.items[0]);const command=vi.fn();
 render(<CaptionControls caption={caption} composition={composition} disabled={false} command={command} />);
 const size=screen.getByRole("spinbutton",{name:"Caption size"});
 expect(size).toHaveValue(44);fireEvent.blur(size);expect(command).not.toHaveBeenCalled();
 fireEvent.change(size,{target:{value:"48"}});fireEvent.blur(size);
 expect(command).toHaveBeenCalledWith({kind:"text",text:{...caption,fontSize:48}});
});

it("a new format commits once after every affected visual item has an explicit framing review",async()=>{
 const command=vi.fn(),preview=vi.fn(),done=vi.fn(),inspect=vi.fn();
 render(<FramingControls composition={composition} media={[]} sourceUrls={{}} disabled={false} command={command} onDone={done} onPreview={preview} onInspectItem={inspect} />);
 fireEvent.keyDown(screen.getByRole("combobox",{name:"Video shape"}),{key:"Enter"});
 fireEvent.click(await screen.findByRole("option",{name:"Fit Clip 1 to 9:16"}));
 expect(command).not.toHaveBeenCalled();
 expect(preview).toHaveBeenCalledWith(expect.objectContaining({preset:"portrait"}));
 fireEvent.click(screen.getByRole("button",{name:"Apply framing"}));
 expect(command).not.toHaveBeenCalled();expect(inspect).toHaveBeenLastCalledWith("two");
 fireEvent.click(screen.getByRole("button",{name:"Apply framing"}));
 expect(command).not.toHaveBeenCalled();expect(inspect).toHaveBeenLastCalledWith("three");
 fireEvent.click(screen.getByRole("button",{name:"Apply framing"}));
 expect(command).toHaveBeenCalledTimes(1);expect(command).toHaveBeenCalledWith({kind:"preset",preset:"portrait",fits:composition.items.map(item=>({itemId:item.id,fit:"fit"}))});expect(done).toHaveBeenCalledTimes(1);
});

it("framing preview rescales captions once and cancel retains the saved typography", async()=>{
 const source={...composition,text:[createCaption(composition,composition.items[0])]}; const original=structuredClone(source); const command=vi.fn(),preview=vi.fn();
 const props={media:[],sourceUrls:{},disabled:false,command,onDone:vi.fn(),onPreview:preview};
 const view=render(<FramingControls composition={source} {...props} />);
 fireEvent.keyDown(screen.getByRole("combobox",{name:"Video shape"}),{key:"Enter"});fireEvent.click(await screen.findByRole("option",{name:"Fit Clip 1 to 9:16"}));
 const portrait=VideoCompositionSchema.parse(preview.mock.calls.at(-1)?.[0]);expect(portrait.text[0]?.fontSize).toBe(77.575111);
 // The real parent renders the proposed composition back into the panel.
 view.rerender(<FramingControls composition={portrait} {...props} />);
 fireEvent.click(screen.getByRole("button",{name:"Fill"}));expect(preview.mock.calls.at(-1)?.[0].text[0]?.fontSize).toBe(77.575111);
 fireEvent.keyDown(screen.getByRole("combobox",{name:"Video shape"}),{key:"Enter"});fireEvent.click(await screen.findByRole("option",{name:"Fit Clip 1 to 16:9"}));
 expect(preview.mock.calls.at(-1)?.[0].text).toEqual(original.text);expect(command).not.toHaveBeenCalled();expect(source).toEqual(original);
});

it("does not commit or preview a format that exceeds a caption size bound",async()=>{
 const source={...composition,text:[{...createCaption(composition,composition.items[0]),fontSize:200}]};const command=vi.fn(),preview=vi.fn();
 render(<FramingControls composition={source} media={[]} sourceUrls={{}} disabled={false} command={command} onDone={vi.fn()} onPreview={preview} />);
 fireEvent.keyDown(screen.getByRole("combobox",{name:"Video shape"}),{key:"Enter"});fireEvent.click(await screen.findByRole("option",{name:"Fit Clip 1 to 9:16"}));
 expect(screen.getByRole("alert")).toHaveTextContent("Caption 1");expect(screen.getByRole("button",{name:"Apply framing"})).toBeDisabled();expect(command).not.toHaveBeenCalled();expect(preview).not.toHaveBeenCalled();expect(source.text[0]?.fontSize).toBe(200);
});

it("timing repair keeps the exact caption and anchor and changes only the reviewed out-of-bounds interval",()=>{
 const text={id:"caption_one",text:"Keep these words",anchor:{kind:"item",itemId:"one"},startFrame:30,endFrame:105,x:.08,y:.83,width:.84,height:.12,fontSize:32,fontWeight:500,color:"#F7F7F7",align:"center"};
 const invalid=VideoCompositionSchema.parse({...composition,text:[text]});const command=vi.fn(),manual=vi.fn();
 render(<TimingRepair composition={invalid} command={command} disabled={false} onDone={vi.fn()} onManual={manual} />);
 expect(command).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Apply shorter timing"}));
 expect(command).toHaveBeenCalledWith({kind:"replace_composition",composition:{...invalid,text:[{...invalid.text[0],endFrame:60}]}});
});

it("timecode editing retains single-frame precision when using the keyboard",()=>{
 const caption=VideoTextSchema.parse({id:"text_frame",text:"Frame",anchor:{kind:"composition"},startFrame:0,endFrame:60,x:.08,y:.83,width:.84,height:.12,fontSize:32,color:"#F7F7F7",align:"center"});const command=vi.fn();
 render(<CaptionTimingControls caption={caption} disabled={false} command={command} />);
 const start=screen.getByRole("spinbutton",{name:"Start seconds"});fireEvent.keyDown(start,{key:"ArrowUp"});expect(start).toHaveValue("0:00.03");fireEvent.blur(start);
 expect(command).toHaveBeenCalledWith({kind:"text",text:{...caption,startFrame:1}});
});
