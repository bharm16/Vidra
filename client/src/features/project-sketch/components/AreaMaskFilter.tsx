import type { ReactElement } from "react";

/** Figma's lavender area tint and 1.5px contour, applied without rewriting the stored mask. */
export function AreaMaskFilter({ id }: { id: string }): ReactElement {
  return <svg className="ps-area-filter" width="0" height="0" aria-hidden="true" focusable="false">
    <defs><filter id={id} x="-2%" y="-2%" width="104%" height="104%" colorInterpolationFilters="sRGB">
      <feMorphology in="SourceAlpha" operator="dilate" radius="1.5" result="expanded" />
      <feComposite in="expanded" in2="SourceAlpha" operator="out" result="edge" />
      <feFlood floodColor="#c3adff" result="edgeColor" />
      <feComposite in="edgeColor" in2="edge" operator="in" result="outline" />
      <feFlood floodColor="#b8a0ff" floodOpacity="0.28" result="tintColor" />
      <feComposite in="tintColor" in2="SourceAlpha" operator="in" result="tint" />
      <feMerge><feMergeNode in="tint" /><feMergeNode in="outline" /></feMerge>
    </filter></defs>
  </svg>;
}
