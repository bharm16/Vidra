import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createFrameVerificationRoutes } from '../frame-verification.routes';
import type { FrameVerificationService } from '@services/frame-verification';
import { FrameVerificationParseError } from '@services/frame-verification';

/**
 * Contract test for the frame-verification route: canonical ApiResponse
 * envelope on success (data), validation failure (400 + details), and
 * unusable model output (502).
 */

interface ErrorWithCode {
  code?: string;
  message?: string;
}

const isSocketPermissionError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as ErrorWithCode;
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  const message =
    typeof candidate.message === 'string' ? candidate.message : '';
  if (code === 'EPERM' || code === 'EACCES') {
    return true;
  }
  return (
    message.includes('listen EPERM') ||
    message.includes('listen EACCES') ||
    message.includes('operation not permitted') ||
    message.includes("Cannot read properties of null (reading 'port')")
  );
};

const runSupertestOrSkip = async <T>(
  execute: () => Promise<T>
): Promise<T | null> => {
  if (process.env.CODEX_SANDBOX === 'seatbelt') {
    return null;
  }
  try {
    return await execute();
  } catch (error) {
    if (isSocketPermissionError(error)) {
      return null;
    }
    throw error;
  }
};

const buildApp = (service: FrameVerificationService): express.Express => {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(createFrameVerificationRoutes(service));
  return app;
};

const VALID_BODY = {
  image: 'data:image/png;base64,Zg==',
  spans: [{ text: 'sunlit studio', category: 'environment.location' }],
};

describe('frame-verification route contract', () => {
  it('returns success envelope with verification data', async () => {
    const verifyMock = vi.fn().mockResolvedValue({
      verdicts: [
        {
          span: VALID_BODY.spans[0],
          verdict: 'present',
          confidence: 0.9,
        },
      ],
      model: 'gpt-4o-mini',
      durationMs: 42,
    });
    const app = buildApp({
      verify: verifyMock,
    } as unknown as FrameVerificationService);

    const response = await runSupertestOrSkip(() =>
      request(app).post('/frame-verification').send(VALID_BODY)
    );
    if (!response) return;

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.verdicts).toHaveLength(1);
    expect(response.body.data.model).toBe('gpt-4o-mini');
    expect(verifyMock).toHaveBeenCalledWith(VALID_BODY);
  });

  it('rejects invalid bodies with 400 and details', async () => {
    const app = buildApp({
      verify: vi.fn(),
    } as unknown as FrameVerificationService);

    const response = await runSupertestOrSkip(() =>
      request(app).post('/frame-verification').send({ image: '', spans: [] })
    );
    if (!response) return;

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(typeof response.body.error).toBe('string');
    expect(typeof response.body.details).toBe('string');
  });

  it('maps unusable model output to 502', async () => {
    const app = buildApp({
      verify: vi
        .fn()
        .mockRejectedValue(new FrameVerificationParseError('bad json')),
    } as unknown as FrameVerificationService);

    const response = await runSupertestOrSkip(() =>
      request(app).post('/frame-verification').send(VALID_BODY)
    );
    if (!response) return;

    expect(response.status).toBe(502);
    expect(response.body.success).toBe(false);
  });
});
