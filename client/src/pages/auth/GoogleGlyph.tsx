import type React from "react";
import authGoogle from "@/assets/design-system/auth-google.svg";

/* Exact Page 21 provider artwork, kept at its intrinsic 24px geometry. */
export function GoogleGlyph(): React.ReactElement {
  return <img src={authGoogle} alt="" draggable={false} />;
}
