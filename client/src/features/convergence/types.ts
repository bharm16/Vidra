/**
 * Camera-motion types for the depth-based motion picker (Frontend)
 *
 * These mirror the camera-path types in server/src/services/convergence/types.ts.
 * The rest of the convergence wizard's type vocabulary was deleted with the
 * wizard (audit run 4, A5-F6).
 */

/**
 * High-level camera motion grouping used by the picker UI
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
 * Legacy camera path format (position only, no rotation)
 * @deprecated Use CameraPath with CameraTransform instead
 */
export interface LegacyCameraPath {
  id: string;
  label: string;
  start: Position3D;
  end: Position3D;
  duration: number;
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
