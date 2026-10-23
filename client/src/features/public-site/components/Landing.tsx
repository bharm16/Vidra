import { type ReactElement } from "react";
import { Link } from "react-router-dom";
import { type StillName } from "../stills";
import { SiteCta } from "./SiteCta";
import { Still } from "./Still";

const WALL: ReadonlyArray<readonly StillName[]> = [
  ["anime", "fashion", "chameleon", "soda"],
  ["noir", "clay", "whale", "skater", "honey"],
  ["robot", "scifi", "phone", "hat1", "road"],
];

/** Range at a glance: frames from films in every genre, bleeding off both edges. */
export function StillWall(): ReactElement {
  return <div className="vf-site-wall" aria-hidden="true">{WALL.map((row, index) => <div key={row.join()} className="vf-site-wall-row" data-row={index + 1}>{row.map(name => <Still key={name} name={name} className="vf-site-tile" eager={index === 0} />)}</div>)}</div>;
}

const TOOLS = [{ slug: "images", name: "Images" }, { slug: "video", name: "Video" }, { slug: "editor", name: "Editor" }, { slug: "sketch", name: "Sketch" }] as const;
type ToolSlug = typeof TOOLS[number]["slug"];

function ToolMedia({ slug }: { slug: ToolSlug }): ReactElement {
  if (slug === "images") return <span className="vf-site-tool-media" data-kind="batch">{(["hat1", "hat2", "hat3", "hat4"] as const).map(name => <Still key={name} name={name} />)}</span>;
  if (slug === "editor") return <span className="vf-site-tool-media" data-kind="cut">{(["noir", "scifi", "whale"] as const).map(name => <Still key={name} name={name} />)}<i /></span>;
  return <span className="vf-site-tool-media" data-kind={slug}><Still name={slug === "video" ? "road" : "sketch"} /></span>;
}

/** The four tools, each opening its chapter of the product page. */
export function ToolIndex(): ReactElement {
  return <nav className="vf-site-tools" aria-label="Product">{TOOLS.map(tool => <Link key={tool.slug} className="vf-site-tool" to={`/product#${tool.slug}`}><span className="vf-site-tool-name">{tool.name}</span><ToolMedia slug={tool.slug} /></Link>)}</nav>;
}

/** The closing line lands on the blank drive-in screen. */
export function DriveInClosing({ member }: { member: boolean }): ReactElement {
  return <section className="vf-site-closing" aria-labelledby="vf-site-closing-title"><div className="vf-site-drivein" data-member={member || undefined}>
    <Still name="drivein" className="vf-site-drivein-image" />
    <div className="vf-site-screen"><h2 id="vf-site-closing-title">{member ? "Welcome back." : "Your turn."}</h2></div>
    <SiteCta className="vf-site-closing-action" to="/app">{member ? "Open workspace" : "Start creating"}</SiteCta>
  </div></section>;
}
