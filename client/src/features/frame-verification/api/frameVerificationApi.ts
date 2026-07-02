import { apiClient } from '@/services/ApiClient';
import { FrameVerificationResponseSchema } from './schemas';
import type { FrameVerificationData, FrameVerificationSpan } from './schemas';

export interface VerifyFrameRequest {
  /** Image URL or base64 data URI of the generated frame */
  image: string;
  spans: FrameVerificationSpan[];
}

export async function verifyFrame(
  payload: VerifyFrameRequest,
  signal?: AbortSignal
): Promise<FrameVerificationData> {
  const data = await apiClient.post(
    '/frame-verification',
    payload,
    signal ? { signal } : undefined
  );
  const parsed = FrameVerificationResponseSchema.parse(data);

  if (!parsed.success) {
    throw new Error(parsed.error || 'Frame verification failed');
  }

  return parsed.data;
}
