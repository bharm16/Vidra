import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FrameVerificationParseError,
  SpanVerdictService,
  stripCodeFence,
} from '../services/SpanVerdictService';
import type { AIExecutionPort } from '@services/ai-model/ports/AIExecutionPort';
import type { AIResponse } from '@interfaces/IAIClient';
import type { FrameVerificationSpan } from '../types';

const DATA_URI = 'data:image/png;base64,ZmFrZS1pbWFnZQ==';

const SPANS: FrameVerificationSpan[] = [
  { text: 'young painter', category: 'subject.identity' },
  { text: 'sunlit studio', category: 'environment.location' },
];

const createAiResponse = (text: string, model?: string): AIResponse => ({
  text,
  metadata: model !== undefined ? { model } : {},
});

const createAIStub = (
  text: string,
  model?: string
): { ai: AIExecutionPort; executeMock: ReturnType<typeof vi.fn> } => {
  const executeMock = vi.fn().mockResolvedValue(createAiResponse(text, model));
  return { ai: { execute: executeMock }, executeMock };
};

const VALID_RESPONSE = JSON.stringify({
  verdicts: [
    { index: 0, verdict: 'present', confidence: 0.9, evidence: 'a painter' },
    { index: 1, verdict: 'absent', confidence: 0.8 },
  ],
});

describe('SpanVerdictService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (
      SpanVerdictService as unknown as { cachedPrompt: string | null }
    ).cachedPrompt = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps verdicts back to spans by index', async () => {
    const { ai, executeMock } = createAIStub(VALID_RESPONSE, 'gpt-4o-mini');
    const service = new SpanVerdictService(ai);

    const result = await service.judge(DATA_URI, SPANS);

    expect(result.model).toBe('gpt-4o-mini');
    expect(result.verdicts).toHaveLength(2);
    expect(result.verdicts[0]).toMatchObject({
      span: SPANS[0],
      verdict: 'present',
      confidence: 0.9,
      evidence: 'a painter',
    });
    expect(result.verdicts[1]).toMatchObject({
      span: SPANS[1],
      verdict: 'absent',
      confidence: 0.8,
    });
    expect(executeMock).toHaveBeenCalledWith(
      'frame_verification',
      expect.objectContaining({ jsonMode: true, temperature: 0 })
    );
  });

  it('passes data URIs to the model without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { ai, executeMock } = createAIStub(VALID_RESPONSE);
    const service = new SpanVerdictService(ai);

    await service.judge(DATA_URI, SPANS);

    expect(fetchMock).not.toHaveBeenCalled();
    const params = executeMock.mock.calls[0]?.[1] as {
      messages: Array<{
        content: string | Array<{ image_url?: { url: string } }>;
      }>;
    };
    const userContent = params.messages[1]?.content;
    expect(Array.isArray(userContent)).toBe(true);
    const imagePart = (
      userContent as Array<{ image_url?: { url: string; detail?: string } }>
    ).find((part) => part.image_url);
    expect(imagePart?.image_url?.url).toBe(DATA_URI);
    expect(imagePart?.image_url?.detail).toBe('high');
  });

  it('fetches https URLs and converts them to data URIs', async () => {
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: vi.fn((key: string) =>
          key.toLowerCase() === 'content-type' ? 'image/webp' : null
        ),
      },
      arrayBuffer: vi.fn(async () => Buffer.from('fake-image')),
    } as unknown as Response;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response)
    );

    const { ai, executeMock } = createAIStub(VALID_RESPONSE);
    const service = new SpanVerdictService(ai);

    await service.judge('https://example.com/frame.webp', SPANS);

    const params = executeMock.mock.calls[0]?.[1] as {
      messages: Array<{
        content: string | Array<{ image_url?: { url: string } }>;
      }>;
    };
    const userContent = params.messages[1]?.content as Array<{
      image_url?: { url: string };
    }>;
    const imagePart = userContent.find((part) => part.image_url);
    expect(imagePart?.image_url?.url).toBe(
      `data:image/webp;base64,${Buffer.from('fake-image').toString('base64')}`
    );
  });

  it('defaults omitted spans to uncertain with zero confidence', async () => {
    const partial = JSON.stringify({
      verdicts: [{ index: 0, verdict: 'present', confidence: 0.7 }],
    });
    const { ai } = createAIStub(partial);
    const service = new SpanVerdictService(ai);

    const result = await service.judge(DATA_URI, SPANS);

    expect(result.verdicts[1]).toMatchObject({
      span: SPANS[1],
      verdict: 'uncertain',
      confidence: 0,
    });
  });

  it('parses responses wrapped in markdown code fences', async () => {
    const fenced = '```json\n' + VALID_RESPONSE + '\n```';
    const { ai } = createAIStub(fenced);
    const service = new SpanVerdictService(ai);

    const result = await service.judge(DATA_URI, SPANS);

    expect(result.verdicts[0]?.verdict).toBe('present');
  });

  it('throws FrameVerificationParseError on non-JSON responses', async () => {
    const { ai } = createAIStub('I cannot analyze this image.');
    const service = new SpanVerdictService(ai);

    await expect(service.judge(DATA_URI, SPANS)).rejects.toBeInstanceOf(
      FrameVerificationParseError
    );
  });

  it('throws FrameVerificationParseError on schema-invalid verdicts', async () => {
    const invalid = JSON.stringify({
      verdicts: [{ index: 0, verdict: 'maybe', confidence: 0.5 }],
    });
    const { ai } = createAIStub(invalid);
    const service = new SpanVerdictService(ai);

    await expect(service.judge(DATA_URI, SPANS)).rejects.toBeInstanceOf(
      FrameVerificationParseError
    );
  });
});

describe('stripCodeFence', () => {
  it('strips fences with a language tag', () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips bare fences', () => {
    expect(stripCodeFence('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('leaves unfenced text untouched', () => {
    expect(stripCodeFence(' {"a":1} ')).toBe('{"a":1}');
  });
});
