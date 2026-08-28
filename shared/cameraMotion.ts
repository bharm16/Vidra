/**
 * Camera-motion contract: the 18-path catalogue and its UI descriptions.
 *
 * Single source of truth consumed on BOTH sides of the wire — the server's
 * video-generate motion guidance and /api/motion/depth responses, and the
 * client's camera-motion picker — which previously each carried their own
 * copy of this data with nothing pinning them equal. Pure data: no I/O, no
 * framework imports (shared/ purity rule).
 */

export const CAMERA_MOTION_CATEGORIES = [
  "static",
  "pan_tilt",
  "dolly",
  "crane",
  "orbital",
  "compound",
] as const;
export type CameraMotionCategory = (typeof CAMERA_MOTION_CATEGORIES)[number];

/**
 * 3D position for camera path interpolation
 */
export interface Position3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Camera rotation in Euler angles (radians)
 * Converted to quaternions internally for SLERP interpolation to avoid gimbal lock
 */
export interface Rotation3D {
  /** Pitch - rotation around X axis (tilt up/down) */
  pitch: number;
  /** Yaw - rotation around Y axis (pan left/right) */
  yaw: number;
  /** Roll - rotation around Z axis (dutch angle) */
  roll: number;
}

/**
 * Complete camera transform including position and rotation
 */
export interface CameraTransform {
  position: Position3D;
  rotation: Rotation3D;
}

/**
 * Predefined 3D camera movement trajectory used for depth-based parallax rendering
 * Supports both position translation and rotation (pan, tilt, roll)
 */
export interface CameraPath {
  id: string;
  label: string;
  category: CameraMotionCategory;
  start: CameraTransform;
  end: CameraTransform;
  duration: number;
}

/**
 * Default rotation (no rotation)
 */
const NO_ROTATION = { pitch: 0, yaw: 0, roll: 0 };

/**
 * Camera paths for Three.js depth-based parallax rendering
 * Each path defines start and end transforms (position + rotation) for camera animation
 *
 * Movement types:
 * - Pan/Tilt: Camera rotates while staying in place
 * - Dutch: Camera rolls to create tilted horizon
 * - Dolly/Track: Camera translates horizontally or in depth
 * - Pedestal/Crane: Camera translates vertically (with optional tilt)
 * - Arc: Camera orbits around the subject
 * - Reveal: Combined push and pan
 */
export const CAMERA_PATHS: CameraPath[] = [
  // STATIC (1)
  {
    id: "static",
    label: "Static",
    category: "static",
    start: { position: { x: 0, y: 0, z: 0 }, rotation: NO_ROTATION },
    end: { position: { x: 0, y: 0, z: 0 }, rotation: NO_ROTATION },
    duration: 3,
  },

  // PAN/TILT (6)
  {
    id: "pan_left",
    label: "Pan Left",
    category: "pan_tilt",
    start: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { pitch: 0, yaw: 0.25, roll: 0 },
    },
    end: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { pitch: 0, yaw: -0.25, roll: 0 },
    },
    duration: 3,
  },
  {
    id: "pan_right",
    label: "Pan Right",
    category: "pan_tilt",
    start: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { pitch: 0, yaw: -0.25, roll: 0 },
    },
    end: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { pitch: 0, yaw: 0.25, roll: 0 },
    },
    duration: 3,
  },
  {
    id: "tilt_up",
    label: "Tilt Up",
    category: "pan_tilt",
    start: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { pitch: -0.2, yaw: 0, roll: 0 },
    },
    end: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { pitch: 0.15, yaw: 0, roll: 0 },
    },
    duration: 3,
  },
  {
    id: "tilt_down",
    label: "Tilt Down",
    category: "pan_tilt",
    start: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { pitch: 0.15, yaw: 0, roll: 0 },
    },
    end: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { pitch: -0.2, yaw: 0, roll: 0 },
    },
    duration: 3,
  },
  {
    id: "dutch_left",
    label: "Dutch Left",
    category: "pan_tilt",
    start: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { pitch: 0, yaw: 0, roll: 0 },
    },
    end: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { pitch: 0, yaw: 0, roll: -0.18 },
    },
    duration: 3,
  },
  {
    id: "dutch_right",
    label: "Dutch Right",
    category: "pan_tilt",
    start: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { pitch: 0, yaw: 0, roll: 0 },
    },
    end: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { pitch: 0, yaw: 0, roll: 0.18 },
    },
    duration: 3,
  },

  // DOLLY (4)
  {
    id: "push_in",
    label: "Push In",
    category: "dolly",
    start: { position: { x: 0, y: 0, z: -0.1 }, rotation: NO_ROTATION },
    end: { position: { x: 0, y: 0, z: 0.25 }, rotation: NO_ROTATION },
    duration: 3,
  },
  {
    id: "pull_back",
    label: "Pull Back",
    category: "dolly",
    start: { position: { x: 0, y: 0, z: 0.2 }, rotation: NO_ROTATION },
    end: { position: { x: 0, y: 0, z: -0.15 }, rotation: NO_ROTATION },
    duration: 3,
  },
  {
    id: "track_left",
    label: "Track Left",
    category: "dolly",
    start: { position: { x: 0.15, y: 0, z: 0 }, rotation: NO_ROTATION },
    end: { position: { x: -0.15, y: 0, z: 0 }, rotation: NO_ROTATION },
    duration: 3,
  },
  {
    id: "track_right",
    label: "Track Right",
    category: "dolly",
    start: { position: { x: -0.15, y: 0, z: 0 }, rotation: NO_ROTATION },
    end: { position: { x: 0.15, y: 0, z: 0 }, rotation: NO_ROTATION },
    duration: 3,
  },

  // CRANE (4)
  {
    id: "pedestal_up",
    label: "Pedestal Up",
    category: "crane",
    start: { position: { x: 0, y: -0.15, z: 0 }, rotation: NO_ROTATION },
    end: { position: { x: 0, y: 0.15, z: 0 }, rotation: NO_ROTATION },
    duration: 3,
  },
  {
    id: "pedestal_down",
    label: "Pedestal Down",
    category: "crane",
    start: { position: { x: 0, y: 0.15, z: 0 }, rotation: NO_ROTATION },
    end: { position: { x: 0, y: -0.15, z: 0 }, rotation: NO_ROTATION },
    duration: 3,
  },
  {
    id: "crane_up",
    label: "Crane Up",
    category: "crane",
    start: {
      position: { x: 0, y: -0.1, z: 0 },
      rotation: { pitch: -0.1, yaw: 0, roll: 0 },
    },
    end: {
      position: { x: 0, y: 0.15, z: 0.05 },
      rotation: { pitch: 0.05, yaw: 0, roll: 0 },
    },
    duration: 3,
  },
  {
    id: "crane_down",
    label: "Crane Down",
    category: "crane",
    start: {
      position: { x: 0, y: 0.15, z: 0.05 },
      rotation: { pitch: 0.05, yaw: 0, roll: 0 },
    },
    end: {
      position: { x: 0, y: -0.1, z: 0 },
      rotation: { pitch: -0.1, yaw: 0, roll: 0 },
    },
    duration: 3,
  },

  // ORBITAL (2)
  {
    id: "arc_left",
    label: "Arc Left",
    category: "orbital",
    start: {
      position: { x: 0.2, y: 0, z: 0.1 },
      rotation: { pitch: 0, yaw: -0.15, roll: 0 },
    },
    end: {
      position: { x: -0.2, y: 0, z: 0.1 },
      rotation: { pitch: 0, yaw: 0.15, roll: 0 },
    },
    duration: 3,
  },
  {
    id: "arc_right",
    label: "Arc Right",
    category: "orbital",
    start: {
      position: { x: -0.2, y: 0, z: 0.1 },
      rotation: { pitch: 0, yaw: 0.15, roll: 0 },
    },
    end: {
      position: { x: 0.2, y: 0, z: 0.1 },
      rotation: { pitch: 0, yaw: -0.15, roll: 0 },
    },
    duration: 3,
  },

  // COMPOUND (1)
  {
    id: "reveal",
    label: "Reveal",
    category: "compound",
    start: {
      position: { x: -0.1, y: 0, z: -0.1 },
      rotation: { pitch: 0, yaw: -0.15, roll: 0 },
    },
    end: {
      position: { x: 0.05, y: 0, z: 0.15 },
      rotation: { pitch: 0, yaw: 0.1, roll: 0 },
    },
    duration: 3,
  },
];

// ============================================================================
// Camera Motion Descriptions (Task 1.8)
// ============================================================================

/**
 * Text descriptions for camera motions used in fallback mode
 * When depth estimation fails, these descriptions help users understand each motion
 */
export const CAMERA_MOTION_DESCRIPTIONS: Record<string, string> = {
  static: "Camera remains fixed. Best for dialogue or contemplative scenes.",
  pan_left: "Camera rotates left while staying in place. Reveals new elements.",
  pan_right:
    "Camera rotates right while staying in place. Reveals new elements.",
  tilt_up: "Camera tilts upward. Reveals height or creates awe.",
  tilt_down: "Camera tilts downward. Creates introspection or reveals ground.",
  dutch_left: "Camera rolls left for tilted horizon. Adds tension or unease.",
  dutch_right: "Camera rolls right for tilted horizon. Adds tension or unease.",
  push_in: "Camera moves toward subject. Creates intimacy or tension.",
  pull_back:
    "Camera moves away from subject. Reveals context or creates distance.",
  track_left: "Camera slides left. Follows action or reveals scene laterally.",
  track_right:
    "Camera slides right. Follows action or reveals scene laterally.",
  pedestal_up: "Camera rises vertically. Reveals overhead perspective.",
  pedestal_down: "Camera lowers vertically. Grounds the viewer.",
  crane_up: "Camera rises with subtle tilt. Creates grandeur.",
  crane_down: "Camera descends with subtle tilt. Creates intimacy.",
  arc_left: "Camera orbits left around subject. Dynamic perspective shift.",
  arc_right: "Camera orbits right around subject. Dynamic perspective shift.",
  reveal: "Combined push and pan. Builds anticipation for dramatic reveal.",
};
