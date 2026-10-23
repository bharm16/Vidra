import { type CSSProperties, type ReactElement } from "react";
import { STILLS, type StillName } from "../stills";

/** A decorative still; the section around it carries the words. */
export function Still({ name, className, eager = false, style }: { name: StillName; className?: string; eager?: boolean; style?: CSSProperties }): ReactElement {
  const still = STILLS[name];
  return <img className={className} src={still.src} width={still.width} height={still.height} alt="" loading={eager ? "eager" : "lazy"} decoding="async" style={style} />;
}
