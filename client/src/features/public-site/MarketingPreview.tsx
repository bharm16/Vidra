import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";

export const PUBLIC_RUNNER = "/design-assets/fidelity-public-stadium.png";
export const PUBLIC_DESK = "/design-assets/fidelity-public-desk.png";

/** The fixed example composition from W01/W06, scaled with its enclosing preview. */
function AssemblyPreview(): ReactElement {
  return <div className="vf-site-timeline" aria-label="Example video edit">
    <div className="vf-site-ruler">{["0s", "2s", "4s", "6s", "8s", "10s", "12s"].map(time => <span key={time}>{time}</span>)}</div>
    {["video", "captions", "audio", "music"].map((name, index) => <span className={`vf-site-track-icon vf-site-track-icon-${index}`} key={name}><span style={{ maskImage: `url(/design-assets/fidelity-public-${name}-mask.svg)` }} /></span>)}
    <div className="vf-site-visual-row">{[
      { label: "Stadium · v1", image: PUBLIC_RUNNER, width: 272 },
      { label: "Desk · v2", image: PUBLIC_DESK, width: 204 },
      { label: "Stadium · v2", image: PUBLIC_RUNNER, width: 272 },
    ].map((clip, index) => <div key={clip.label} className="vf-site-clip" data-selected={index === 0 || undefined} style={{ width: clip.width }}><div className="vf-site-thumbnail-strip">{Array.from({ length: 5 }, (_, tile) => <img key={tile} src={clip.image} alt="" width={56} height={56} />)}</div><span>{clip.label}</span>{index === 0 ? <><i /><i /></> : null}</div>)}</div>
    <div className="vf-site-caption-track">Make room for evening.</div>
    {[76, 552].map(left => <div key={left} className="vf-site-source-track" style={{ left }}><img src="/design-assets/fidelity-public-source-audio.svg" alt="" width={360} height={36} /></div>)}
    <div className="vf-site-music-track"><img src="/design-assets/fidelity-public-music.svg" alt="" width={360} height={36} /></div>
    <div className="vf-site-playhead"><img src="/design-assets/fidelity-public-playhead-dot.svg" alt="" width={6} height={6} /></div>
    <div className="vf-site-output-end" />
  </div>;
}

export function MarketingPreview({ image = PUBLIC_RUNNER, assembly = false, words, action = "Make video", mobileShots = false }: { image?: string; assembly?: boolean; words?: string; action?: string; mobileShots?: boolean }): ReactElement {
  const root = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = (): void => { setScale(element.clientWidth / 1280); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div className="vf-site-preview" data-assembly={assembly || undefined} data-mobile-shots={mobileShots || undefined} ref={root} style={{ "--vf-site-preview-scale": scale } as CSSProperties}>
    <img className="vf-site-preview-media" src={image} alt={image === PUBLIC_RUNNER ? "A runner on a floodlit track" : "An artisan at a desk in warm light"} />
    <div className="vf-site-preview-example">{assembly ? <><p className="vf-site-preview-caption">Make room for evening.</p><AssemblyPreview /></> : words ? <div className="vf-site-example-prompt"><span>{words}</span><span className="vf-site-example-action">{action}</span></div> : null}</div>
    {mobileShots ? <div className="vf-site-mobile-shots">{[{ label: "Stadium", image: PUBLIC_RUNNER }, { label: "Desk", image: PUBLIC_DESK }, { label: "Run", image: PUBLIC_RUNNER }].map(shot => <div key={shot.label}><img src={shot.image} alt="" /><span>{shot.label}</span></div>)}</div> : null}
  </div>;
}
