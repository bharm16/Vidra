import { type CSSProperties, type ReactElement } from "react";
import { type StillName } from "../stills";
import { SiteCta } from "./SiteCta";
import { Still } from "./Still";

function ChapterHead({ id, title, action, to }: { id: string; title: string; action: string; to: string }): ReactElement {
  return <div className="vf-site-chapter-head"><h2 id={`${id}-title`} className="vf-site-mega">{title}</h2><SiteCta to={to} tone="ghost">{action}</SiteCta></div>;
}

/** One request, four pictures. */
export function ImagesChapter(): ReactElement {
  return <section id="images" className="vf-site-chapter" data-chapter="images" aria-labelledby="images-title">
    <ChapterHead id="images" title="Images" action="Make a picture" to="/app?intent=make-image" />
    <div className="vf-site-batch">{(["hat1", "hat2", "hat3", "hat4"] as const).map(name => <Still key={name} name={name} />)}</div>
  </section>;
}

/** The word overlaps the moving picture; the strip below is the same shot over time. */
export function VideoChapter(): ReactElement {
  return <section id="video" className="vf-site-chapter" data-chapter="video" aria-labelledby="video-title">
    <Still name="road" className="vf-site-clip" />
    <ChapterHead id="video" title="Video" action="Make a clip" to="/app?intent=make-video" />
    <div className="vf-site-filmstrip" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map(frame => <span key={frame} style={{ "--vf-frame": frame } as CSSProperties} />)}</div>
  </section>;
}

const CUT: ReadonlyArray<readonly [StillName, number, number]> = [["anime", 220, 60], ["noir", 150, 35], ["scifi", 300, 30], ["whale", 210, 55], ["skater", 120, 50], ["soda", 200, 50], ["robot", 136, 60]];

function waveform(bars: number, pitch: number, scale: readonly [number, number, number]): string {
  return Array.from({ length: bars }, (_, index) => {
    const x = index * pitch;
    return Math.abs(0.6 * Math.sin(x / scale[0]) + 0.3 * Math.sin(x / scale[1] + 1) + 0.1 * Math.sin(x / scale[2] + 2));
  }).map((level, index) => `M${index + 0.3} ${(1 - level) * 0.45} V${1 - (1 - level) * 0.45}`).join("");
}
const WAVE_WIDE = waveform(272, 5, [37, 11, 5.3]);
const WAVE_NARROW = waveform(117, 3, [15, 5, 2.2]);

/** Shots of different lengths cut together, with sound under them and a playhead across both. */
export function EditorChapter(): ReactElement {
  return <section id="editor" className="vf-site-chapter" data-chapter="editor" aria-labelledby="editor-title">
    <ChapterHead id="editor" title="Editor" action="Start editing" to="/app?intent=video-edit" />
    <div className="vf-site-editor" aria-hidden="true">
      <Still name="scifi" className="vf-site-monitor" />
      <div className="vf-site-timeline">
        <div className="vf-site-lane">{CUT.map(([name, length, focus]) => <Still key={name} name={name} style={{ flexGrow: length, objectPosition: `${focus}% 50%` }} />)}</div>
        <svg className="vf-site-wave" data-size="wide" viewBox="0 0 272 1" preserveAspectRatio="none"><path d={WAVE_WIDE} /></svg>
        <svg className="vf-site-wave" data-size="narrow" viewBox="0 0 117 1" preserveAspectRatio="none"><path d={WAVE_NARROW} /></svg>
        <span className="vf-site-playhead" />
      </div>
    </div>
  </section>;
}

/** The word crosses from the drawing to the render. */
export function SketchChapter(): ReactElement {
  return <section id="sketch" className="vf-site-chapter" data-chapter="sketch" aria-labelledby="sketch-title">
    <div className="vf-site-split">
      <Still name="sketch" className="vf-site-split-image" />
      <h2 id="sketch-title" className="vf-site-mega vf-site-split-title"><span>Sketch</span><span aria-hidden="true">Sketch</span></h2>
      <SiteCta className="vf-site-split-action" to="/app?intent=sketch" tone="ghost">Start a sketch</SiteCta>
    </div>
  </section>;
}
