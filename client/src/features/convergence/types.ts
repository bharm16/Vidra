/**
 * Camera-motion types for the depth-based motion picker (Frontend)
 *
 * The camera-motion vocabulary is a cross-layer contract; the canonical
 * definitions live in shared/cameraMotion.ts. The rest of the convergence
 * wizard's type vocabulary was deleted with the wizard (audit run 4, A5-F6).
 */

export {
  CAMERA_MOTION_CATEGORIES,
  type CameraMotionCategory,
  type Position3D,
  type Rotation3D,
  type CameraTransform,
  type CameraPath,
} from "@shared/cameraMotion";
