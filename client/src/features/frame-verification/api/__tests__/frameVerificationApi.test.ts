import { describe, expect, it, vi, beforeEach } from 'vitest';
import { verifyFrame } from '../frameVerificationApi';

const apiPostMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/ApiClient', () => ({
  apiClient: {
    post: apiPostMock,
  },
}));

const validData = {
  verdicts: [
    {
      span: { text: 'sunlit studio', category: 'environment.location' },
      verdict: 'present',
      confidence: 0.9,
      evidence: 'bright window light over easel',
    },
  ],
  model: 'gpt-4o-mini-2024-07-18',
  durationMs: 1234,
};

const request = {
  image: 'data:image/webp;base64,Zg==',
  spans: [{ text: 'sunlit studio', category: 'environment.location' }],
};

describe('verifyFrame', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns parsed verdicts for a successful response', async () => {
    apiPostMock.mockResolvedValue({ success: true, data: validData });

    const result = await verifyFrame(request);

    expect(apiPostMock).toHaveBeenCalledWith(
      '/frame-verification',
      request,
      undefined
    );
    expect(result).toMatchObject(validData);
  });

  it('throws the server error message on failure envelopes', async () => {
    apiPostMock.mockResolvedValue({
      success: false,
      error: 'Frame verification model returned an unusable response',
    });

    await expect(verifyFrame(request)).rejects.toThrow('unusable response');
  });

  it('rejects malformed response shapes', async () => {
    apiPostMock.mockResolvedValue({ success: true, data: { nope: true } });

    await expect(verifyFrame(request)).rejects.toThrow();
  });
});
