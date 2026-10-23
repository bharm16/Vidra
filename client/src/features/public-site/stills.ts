/** Generated stills for the public site; the originals live in Figma 15 › Public site imagery. */
export interface Still { src: string; width: number; height: number }

const still = (name: string, width: number, height: number): Still => ({ src: `/public-site/${name}.webp`, width, height });

export const STILLS = {
  anime: still("anime", 1376, 768),
  fashion: still("fashion", 768, 1376),
  chameleon: still("chameleon", 1024, 1024),
  soda: still("soda", 1376, 768),
  noir: still("noir", 1376, 768),
  clay: still("clay", 1024, 1024),
  whale: still("whale", 1376, 768),
  skater: still("skater", 768, 1376),
  honey: still("honey", 768, 1376),
  robot: still("robot", 1024, 1024),
  scifi: still("scifi", 1376, 768),
  phone: still("phone", 768, 1376),
  hat1: still("hat1", 928, 1152),
  hat2: still("hat2", 928, 1152),
  hat3: still("hat3", 928, 1152),
  hat4: still("hat4", 928, 1152),
  road: still("road", 1584, 672),
  sketch: still("sketch", 1376, 768),
  drivein: still("drivein", 1376, 768),
} as const satisfies Record<string, Still>;
export type StillName = keyof typeof STILLS;

/** Docs illustrations keep the earlier product stills. */
export const PUBLIC_RUNNER = "/design-assets/fidelity-public-stadium.png";
export const PUBLIC_DESK = "/design-assets/fidelity-public-desk.png";
