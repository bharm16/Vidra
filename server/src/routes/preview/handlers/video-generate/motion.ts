import { describeCameraMotion, CAMERA_PATHS } from "#shared/cameraMotion";
import { CAMERA_MOTION_KEY, SUBJECT_MOTION_KEY } from "./constants";

export interface MotionContext {
  cameraMotionId: string | null;
  cameraMotionText: string | null;
  subjectMotion: string | null;
}

const normalizeMotionString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toTitleCaseFromId = (value: string): string =>
  value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const resolveCameraMotionText = (cameraMotionId: string): string => {
  const description = describeCameraMotion(cameraMotionId);
  if (description) {
    return description;
  }
  const path = CAMERA_PATHS.find((item) => item.id === cameraMotionId);
  if (path?.label) {
    return path.label;
  }
  return toTitleCaseFromId(cameraMotionId);
};

export const resolveMotionContext = (
  normalizedParams: Record<string, unknown> | null,
  rawParams: unknown,
): MotionContext => {
  const normalizedCameraMotion = normalizeMotionString(
    normalizedParams?.[CAMERA_MOTION_KEY],
  );
  const normalizedSubjectMotion = normalizeMotionString(
    normalizedParams?.[SUBJECT_MOTION_KEY],
  );

  const rawRecord =
    rawParams && typeof rawParams === "object"
      ? (rawParams as Record<string, unknown>)
      : null;
  const rawCameraMotion =
    normalizedCameraMotion ??
    normalizeMotionString(rawRecord?.[CAMERA_MOTION_KEY]);
  const rawSubjectMotion =
    normalizedSubjectMotion ??
    normalizeMotionString(rawRecord?.[SUBJECT_MOTION_KEY]);

  return {
    cameraMotionId: rawCameraMotion,
    cameraMotionText: rawCameraMotion
      ? resolveCameraMotionText(rawCameraMotion)
      : null,
    subjectMotion: rawSubjectMotion,
  };
};

export const extractMotionMeta = (params: unknown) => {
  const record =
    params && typeof params === "object"
      ? (params as Record<string, unknown>)
      : null;
  const cameraMotionId = normalizeMotionString(record?.[CAMERA_MOTION_KEY]);
  const subjectMotion = normalizeMotionString(record?.[SUBJECT_MOTION_KEY]);
  return {
    hasCameraMotion: Boolean(cameraMotionId),
    cameraMotionId,
    hasSubjectMotion: Boolean(subjectMotion),
    subjectMotionLength: subjectMotion?.length ?? 0,
  } as const;
};
