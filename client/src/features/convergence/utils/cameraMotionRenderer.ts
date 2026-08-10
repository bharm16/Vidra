/**
 * Camera Motion Renderer Utility
 *
 * Three.js utility for depth-based parallax rendering of camera motion previews.
 * Uses depth maps to create 3D parallax effects for camera path visualization.
 *
 * Requirements:
 * - 6.1: Use Three.js to create depth-displaced mesh from image and depth map
 * - 6.2: Animate camera position using ease-in-out interpolation
 * - 6.3: Render previews at 320x180 resolution and 15fps for performance
 * - 6.4: Play preview animation on hover
 * - 6.5: Render camera path previews lazily on hover
 * - 6.6: Animate frames directly with requestAnimationFrame (Safari compatibility)
 */

import * as THREE from "three";
import { API_CONFIG } from "@/config/api.config";
import { logger } from "@/services/LoggingService";
import { sanitizeError } from "@/utils/logging";
import { safeUrlHost } from "@/utils/url";
import type {
  CameraMotionCategory,
  CameraPath,
  CameraTransform,
  Position3D,
  Rotation3D,
} from "../types";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for rendering camera motion frames
 */
export interface RenderOptions {
  /** Width of the rendered frames (default: 320) */
  width?: number;
  /** Height of the rendered frames (default: 180) */
  height?: number;
  /** Frames per second (default: 15) */
  fps?: number;
  /** Displacement scale for depth effect (default: 0.3) */
  displacementScale?: number;
}

/**
 * Frame animator controls for playback
 */
export interface FrameAnimatorControls {
  /** Start playing the animation */
  start: () => void;
  /** Stop the animation */
  stop: () => void;
  /** Check if animation is currently playing */
  isPlaying: () => boolean;
}

/**
 * Three.js resources that need to be disposed
 */
interface ThreeResources {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  geometry: THREE.PlaneGeometry;
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
  imageTexture: THREE.Texture;
  depthTexture: THREE.Texture;
}

/**
 * Legacy camera path format (position only, no rotation)
 * Used for backward compatibility
 */
interface LegacyCameraPath {
  id: string;
  label: string;
  category?: CameraMotionCategory;
  start: Position3D;
  end: Position3D;
  duration: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 180;
const DEFAULT_FPS = 15;
const DEFAULT_DISPLACEMENT_SCALE = 0.3;
const log = logger.child("cameraMotionRenderer");
const OPERATION = "renderCameraMotionFrames";
const proxiedHostsLogged = new Set<string>();

// ============================================================================
// Shader Code
// ============================================================================

/**
 * Vertex shader for depth-displaced plane
 * Displaces vertices based on depth map values
 */
const vertexShader = `
  uniform sampler2D depthMap;
  uniform float displacementScale;
  
  varying vec2 vUv;
  
  void main() {
    vUv = uv;
    
    // Sample depth map (grayscale, so use any channel)
    float depth = texture2D(depthMap, uv).r;
    
    // Displace vertex along Z axis based on depth
    // Invert depth so closer objects (white) come forward
    vec3 displaced = position;
    displaced.z += (1.0 - depth) * displacementScale;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

/**
 * Fragment shader for rendering the image texture
 */
const fragmentShader = `
  uniform sampler2D imageMap;
  
  varying vec2 vUv;
  
  void main() {
    gl_FragColor = texture2D(imageMap, vUv);
  }
`;

// ============================================================================
// Scene Setup (Task 22.1)
// ============================================================================

/**
 * Creates a Three.js scene with PerspectiveCamera for depth parallax rendering
 *
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Scene and camera objects
 */
function createScene(
  width: number,
  height: number,
): {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
} {
  // Create scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  // Create perspective camera
  // FOV of 50 degrees provides natural perspective
  // Position camera to view the plane properly
  const aspectRatio = width / height;
  const camera = new THREE.PerspectiveCamera(50, aspectRatio, 0.1, 100);
  camera.position.set(0, 0, 1.5);
  camera.lookAt(0, 0, 0);

  // Create WebGL renderer
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true, // Required for toDataURL
    alpha: false,
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(1); // Use 1 for consistent frame sizes

  return { scene, camera, renderer };
}

// ============================================================================
// Mesh Creation (Task 22.2)
// ============================================================================

/**
 * Creates a depth-displaced PlaneGeometry mesh with custom shaders
 *
 * The mesh uses a high-resolution plane geometry that gets displaced
 * based on the depth map values. This creates a 3D parallax effect
 * when the camera moves.
 *
 * @param imageTexture - The source image texture
 * @param depthTexture - The depth map texture
 * @param displacementScale - Scale factor for depth displacement
 * @returns The mesh, geometry, and material for cleanup
 */
function createDepthDisplacedMesh(
  imageTexture: THREE.Texture,
  depthTexture: THREE.Texture,
  displacementScale: number,
): {
  mesh: THREE.Mesh;
  geometry: THREE.PlaneGeometry;
  material: THREE.ShaderMaterial;
} {
  // Create high-resolution plane geometry for smooth displacement
  // 128x72 segments provides good detail while maintaining performance
  // Cast image to HTMLImageElement to access width/height
  const image = imageTexture.image as HTMLImageElement;
  const aspectRatio = image.width / image.height;
  const planeWidth = aspectRatio;
  const planeHeight = 1;
  const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight, 128, 72);

  // Create shader material with depth displacement
  const material = new THREE.ShaderMaterial({
    uniforms: {
      imageMap: { value: imageTexture },
      depthMap: { value: depthTexture },
      displacementScale: { value: displacementScale },
    },
    vertexShader,
    fragmentShader,
    side: THREE.FrontSide,
  });

  // Create mesh
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, 0);

  return { mesh, geometry, material };
}

// ============================================================================
// Texture Loading (Task 22.3)
// ============================================================================

/**
 * Loads an image from URL as a Three.js texture
 *
 * @param url - URL of the image to load
 * @returns Promise resolving to the loaded texture
 */
function loadTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();

    // Handle CORS for cross-origin images
    loader.setCrossOrigin("anonymous");

    loader.load(
      url,
      (texture) => {
        // Configure texture for best quality
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        resolve(texture);
      },
      undefined, // Progress callback (not used)
      (error) => {
        reject(new Error(`Failed to load texture from ${url}: ${error}`));
      },
    );
  });
}

const MEDIA_PROXY_PATH = "/storage/proxy";

const shouldProxyUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "storage.googleapis.com" ||
      parsed.hostname.endsWith(".storage.googleapis.com")
    );
  } catch {
    return false;
  }
};

export const buildProxyUrl = (url: string): string => {
  if (!shouldProxyUrl(url)) {
    return url;
  }

  const base = API_CONFIG.baseURL.endsWith("/")
    ? API_CONFIG.baseURL.slice(0, -1)
    : API_CONFIG.baseURL;

  if (url.includes(MEDIA_PROXY_PATH)) {
    return url;
  }

  const proxiedUrl = `${base}${MEDIA_PROXY_PATH}?url=${encodeURIComponent(url)}`;
  const host = safeUrlHost(url);
  if (host && !proxiedHostsLogged.has(host)) {
    proxiedHostsLogged.add(host);
    log.info("Proxying camera motion media through the signed-url proxy", {
      operation: "buildProxyUrl",
      host,
      proxyPath: MEDIA_PROXY_PATH,
    });
  }

  return proxiedUrl;
};

/**
 * Loads both image and depth map textures
 *
 * @param imageUrl - URL of the source image
 * @param depthMapUrl - URL of the depth map
 * @returns Promise resolving to both textures
 */
async function loadTextures(
  imageUrl: string,
  depthMapUrl: string,
): Promise<{ imageTexture: THREE.Texture; depthTexture: THREE.Texture }> {
  const startedAt = Date.now();
  const imageUrlHost = safeUrlHost(imageUrl);
  const depthMapUrlHost = safeUrlHost(depthMapUrl);

  log.debug("Loading camera motion textures", {
    operation: "loadTextures",
    imageUrlHost,
    depthMapUrlHost,
  });

  try {
    const [imageTexture, depthTexture] = await Promise.all([
      loadTexture(buildProxyUrl(imageUrl)),
      loadTexture(buildProxyUrl(depthMapUrl)),
    ]);

    log.debug("Loaded camera motion textures", {
      operation: "loadTextures",
      durationMs: Date.now() - startedAt,
      imageUrlHost,
      depthMapUrlHost,
    });

    return { imageTexture, depthTexture };
  } catch (error) {
    const info = sanitizeError(error);
    const errObj = error instanceof Error ? error : new Error(info.message);
    log.error("Failed to load camera motion textures", errObj, {
      operation: "loadTextures",
      durationMs: Date.now() - startedAt,
      imageUrlHost,
      depthMapUrlHost,
      error: info.message,
      errorName: info.name,
    });
    throw errObj;
  }
}

// ============================================================================
// Interpolation (Task 22.5)
// ============================================================================

/**
 * Ease-in-out interpolation function for smooth camera motion
 *
 * Uses cubic ease-in-out for natural acceleration and deceleration.
 * t=0 returns 0, t=0.5 returns 0.5, t=1 returns 1
 *
 * @param t - Progress value from 0 to 1
 * @returns Eased value from 0 to 1
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Interpolates between two 3D positions with easing
 *
 * @param start - Starting position
 * @param end - Ending position
 * @param t - Progress value from 0 to 1 (will be eased)
 * @returns Interpolated position
 */
function interpolatePosition(
  start: Position3D,
  end: Position3D,
  t: number,
): Position3D {
  const easedT = easeInOutCubic(t);
  return {
    x: start.x + (end.x - start.x) * easedT,
    y: start.y + (end.y - start.y) * easedT,
    z: start.z + (end.z - start.z) * easedT,
  };
}

/**
 * Default rotation (no rotation) for legacy path compatibility
 */
const DEFAULT_ROTATION: Rotation3D = { pitch: 0, yaw: 0, roll: 0 };
const DEFAULT_CATEGORY: CameraMotionCategory = "static";

/**
 * Checks if a camera path uses the legacy format (position only)
 */
function isLegacyCameraPath(
  path: CameraPath | LegacyCameraPath,
): path is LegacyCameraPath {
  return !("position" in path.start);
}

/**
 * Normalizes a camera path to the new format with rotation support
 * Handles backward compatibility with legacy paths that only have position
 */
function normalizeCameraPath(path: CameraPath | LegacyCameraPath): CameraPath {
  if (isLegacyCameraPath(path)) {
    return {
      ...path,
      category: path.category ?? DEFAULT_CATEGORY,
      start: { position: path.start, rotation: DEFAULT_ROTATION },
      end: { position: path.end, rotation: DEFAULT_ROTATION },
    };
  }
  return path;
}

/**
 * Creates a quaternion from Euler rotation (pitch, yaw, roll in radians)
 * Uses 'YXZ' order which is standard for camera rotations:
 * - First yaw (look left/right)
 * - Then pitch (look up/down)
 * - Finally roll (tilt head)
 *
 * @param rotation - Rotation in Euler angles (radians)
 * @returns THREE.Quaternion representing the rotation
 */
function rotationToQuaternion(rotation: Rotation3D): THREE.Quaternion {
  // YXZ order is standard for FPS-style camera controls
  const euler = new THREE.Euler(
    rotation.pitch,
    rotation.yaw,
    rotation.roll,
    "YXZ",
  );
  return new THREE.Quaternion().setFromEuler(euler);
}

/**
 * Interpolates between two rotations using quaternion SLERP
 *
 * SLERP (Spherical Linear Interpolation) is used instead of linear
 * interpolation of Euler angles to avoid gimbal lock and ensure
 * smooth rotation along the shortest arc.
 *
 * @param start - Starting rotation in Euler angles
 * @param end - Ending rotation in Euler angles
 * @param t - Progress value from 0 to 1 (will be eased)
 * @returns THREE.Quaternion representing the interpolated rotation
 */
function interpolateRotation(
  start: Rotation3D,
  end: Rotation3D,
  t: number,
): THREE.Quaternion {
  const easedT = easeInOutCubic(t);

  const startQ = rotationToQuaternion(start);
  const endQ = rotationToQuaternion(end);

  // Use slerpQuaternions for smooth rotation interpolation
  // This is the modern API - the static THREE.Quaternion.slerp() is deprecated
  const result = new THREE.Quaternion();
  result.slerpQuaternions(startQ, endQ, easedT);

  return result;
}

/**
 * Interpolates complete camera transform (position + rotation)
 *
 * @param start - Starting transform
 * @param end - Ending transform
 * @param t - Progress value from 0 to 1
 * @returns Interpolated position and quaternion rotation
 */
function interpolateTransform(
  start: CameraTransform,
  end: CameraTransform,
  t: number,
): { position: Position3D; quaternion: THREE.Quaternion } {
  return {
    position: interpolatePosition(start.position, end.position, t),
    quaternion: interpolateRotation(start.rotation, end.rotation, t),
  };
}

// ============================================================================
// Frame Rendering (Task 22.4)
// ============================================================================

/**
 * Renders camera motion frames for a given camera path
 *
 * Creates a sequence of frames showing the camera moving along the specified path.
 * Uses depth-based parallax to create a 3D effect.
 * Supports both position translation and rotation (pan, tilt, roll) via quaternion SLERP.
 *
 * Requirements:
 * - 6.1: Creates depth-displaced mesh from image and depth map
 * - 6.2: Animates camera position and rotation using ease-in-out interpolation
 * - 6.3: Renders at specified resolution and fps (default 320x180 @ 15fps)
 *
 * @param imageUrl - URL of the source image
 * @param depthMapUrl - URL of the depth map
 * @param cameraPath - Camera path definition with start/end transforms (position + rotation)
 * @param options - Render options (width, height, fps, displacementScale)
 * @returns Promise resolving to array of frame data URLs
 */
export async function renderCameraMotionFrames(
  imageUrl: string,
  depthMapUrl: string,
  cameraPath: CameraPath | LegacyCameraPath,
  options?: RenderOptions,
): Promise<string[]> {
  const startedAt = Date.now();
  const width = options?.width ?? DEFAULT_WIDTH;
  const height = options?.height ?? DEFAULT_HEIGHT;
  const fps = options?.fps ?? DEFAULT_FPS;
  const displacementScale =
    options?.displacementScale ?? DEFAULT_DISPLACEMENT_SCALE;
  const imageUrlHost = safeUrlHost(imageUrl);
  const depthMapUrlHost = safeUrlHost(depthMapUrl);

  // Normalize path to new format (handles legacy paths without rotation)
  const normalizedPath = normalizeCameraPath(cameraPath);

  // Calculate total frames based on duration and fps
  const totalFrames = Math.ceil(normalizedPath.duration * fps);
  const renderId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${normalizedPath.id}-${startedAt}`;

  log.debug("Starting camera motion frame render", {
    operation: OPERATION,
    renderId,
    cameraMotionId: normalizedPath.id,
    category: normalizedPath.category,
    durationSec: normalizedPath.duration,
    totalFrames,
    width,
    height,
    fps,
    displacementScale,
    imageUrlHost,
    depthMapUrlHost,
  });

  let resources: ThreeResources | null = null;

  try {
    // Load textures
    const { imageTexture, depthTexture } = await loadTextures(
      imageUrl,
      depthMapUrl,
    );

    // Create scene
    const { scene, camera, renderer } = createScene(width, height);

    // Create depth-displaced mesh
    const { mesh, geometry, material } = createDepthDisplacedMesh(
      imageTexture,
      depthTexture,
      displacementScale,
    );

    scene.add(mesh);

    // Store resources for cleanup
    resources = {
      scene,
      camera,
      renderer,
      geometry,
      material,
      mesh,
      imageTexture,
      depthTexture,
    };

    // Render frames
    const frames: string[] = [];

    for (let i = 0; i < totalFrames; i++) {
      // Calculate progress (0 to 1)
      const progress = i / (totalFrames - 1);

      // Interpolate camera transform (position + rotation) along path
      const transform = interpolateTransform(
        normalizedPath.start,
        normalizedPath.end,
        progress,
      );

      // Update camera position
      // Base position is (0, 0, 1.5), add path offset
      camera.position.set(
        transform.position.x,
        transform.position.y,
        1.5 + transform.position.z,
      );

      // Apply rotation via quaternion (avoids gimbal lock)
      camera.quaternion.copy(transform.quaternion);

      // Render frame
      renderer.render(scene, camera);

      // Capture frame as data URL
      const frameDataUrl = renderer.domElement.toDataURL("image/jpeg", 0.85);
      frames.push(frameDataUrl);
    }

    log.info("Completed camera motion frame render", {
      operation: OPERATION,
      renderId,
      cameraMotionId: normalizedPath.id,
      category: normalizedPath.category,
      totalFrames,
      durationMs: Date.now() - startedAt,
      imageUrlHost,
      depthMapUrlHost,
    });

    return frames;
  } catch (error) {
    const info = sanitizeError(error);
    const errObj = error instanceof Error ? error : new Error(info.message);
    log.error("Camera motion frame render failed", errObj, {
      operation: OPERATION,
      renderId,
      cameraMotionId: normalizedPath.id,
      category: normalizedPath.category,
      durationMs: Date.now() - startedAt,
      totalFrames,
      imageUrlHost,
      depthMapUrlHost,
      error: info.message,
      errorName: info.name,
    });
    throw errObj;
  } finally {
    // Always cleanup resources
    if (resources) {
      disposeResources(resources);
    }
  }
}

// ============================================================================
// Frame Animation (Task 22.6)
// ============================================================================

/**
 * Creates a frame animator for requestAnimationFrame-based playback
 *
 * Uses requestAnimationFrame for smooth animation that's compatible with Safari.
 * The animator loops through the provided frames at the specified fps.
 *
 * Requirement 6.6: Animate frames directly with requestAnimationFrame (Safari compatibility)
 *
 * @param frames - Array of frame data URLs to animate
 * @param fps - Frames per second for playback
 * @param onFrame - Callback called with each frame's data URL and index
 * @returns Controls for starting, stopping, and checking playback state
 */
export function createFrameAnimator(
  frames: string[],
  fps: number,
  onFrame: (frameDataUrl: string, frameIndex: number) => void,
): FrameAnimatorControls {
  let animationFrameId: number | null = null;
  let isAnimating = false;
  let currentFrameIndex = 0;
  let lastFrameTime = 0;

  const frameDuration = 1000 / fps;

  /**
   * Animation loop using requestAnimationFrame
   */
  function animate(timestamp: number): void {
    if (!isAnimating) return;

    // Calculate time since last frame
    const elapsed = timestamp - lastFrameTime;

    // Check if it's time for the next frame
    if (elapsed >= frameDuration) {
      // Update last frame time, accounting for any drift
      lastFrameTime = timestamp - (elapsed % frameDuration);

      // Call the frame callback (with bounds check)
      const frame = frames[currentFrameIndex];
      if (frame) {
        onFrame(frame, currentFrameIndex);
      }

      // Move to next frame (loop back to start)
      currentFrameIndex = (currentFrameIndex + 1) % frames.length;
    }

    // Continue animation loop
    animationFrameId = requestAnimationFrame(animate);
  }

  return {
    /**
     * Start playing the animation
     */
    start(): void {
      if (isAnimating || frames.length === 0) return;

      isAnimating = true;
      currentFrameIndex = 0;
      lastFrameTime = performance.now();

      // Show first frame immediately (with bounds check)
      const firstFrame = frames[0];
      if (firstFrame) {
        onFrame(firstFrame, 0);
      }

      // Start animation loop
      animationFrameId = requestAnimationFrame(animate);
    },

    /**
     * Stop the animation
     */
    stop(): void {
      isAnimating = false;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    },

    /**
     * Check if animation is currently playing
     */
    isPlaying(): boolean {
      return isAnimating;
    },
  };
}

// ============================================================================
// Resource Cleanup (Task 22.8)
// ============================================================================

/**
 * Disposes of all Three.js resources to prevent memory leaks
 *
 * Three.js resources (geometry, materials, textures, renderers) must be
 * explicitly disposed to free GPU memory.
 *
 * @param resources - The Three.js resources to dispose
 */
function disposeResources(resources: ThreeResources): void {
  // Dispose geometry
  resources.geometry.dispose();

  // Dispose material
  resources.material.dispose();

  // Dispose textures
  resources.imageTexture.dispose();
  resources.depthTexture.dispose();

  // Dispose renderer
  resources.renderer.dispose();

  // Remove mesh from scene
  resources.scene.remove(resources.mesh);

  // Clear scene
  resources.scene.clear();
}

/**
 * Creates a cleanup function for external use
 *
 * This is useful when you need to manually manage Three.js resources
 * outside of the renderCameraMotionFrames function.
 *
 * @param resources - The Three.js resources to dispose
 * @returns A cleanup function
 */
export function createCleanupFunction(resources: ThreeResources): () => void {
  return () => disposeResources(resources);
}
