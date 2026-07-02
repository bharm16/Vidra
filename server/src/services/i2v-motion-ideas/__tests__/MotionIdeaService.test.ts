import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIExecutionPort as AIService } from '@services/ai-model/ports/AIExecutionPort';
import type { AIResponse } from '@interfaces/IAIClient';
import type { ImageObservationService } from '@services/image-observation/ImageObservationService';
import type {
  ImageObservation,
  ImageObservationResult,
} from '@services/image-observation/types';
import { MotionIdeaService } from '../MotionIdeaService';
import { MOTION_IDEAS_FALLBACK } from '../types';

const buildObservation = (): ImageObservation => ({
  imageHash: 'hash-123',
  observedAt: new Date('2026-01-01T00:00:00.000Z'),
  subject: {
    type: 'person',
    description: 'runner on trail',
    position: 'center',
    confidence: 0.9,
  },
  framing: {
    shotType: 'medium',
    angle: 'eye-level',
    confidence: 0.9,
  },
  lighting: {
    quality: 'natural',
    timeOfDay: 'golden-hour',
    confidence: 0.9,
  },
  motion: {
    recommended: ['dolly-in', 'pan-left'],
    risky: ['zoom-in'],
    risks: [{ movement: 'zoom-in', reason: 'subject already framed' }],
  },
  confidence: 0.9,
});

const buildObservationResult = (): ImageObservationResult => ({
  success: true,
  observation: buildObservation(),
  cached: false,
  usedFastPath: false,
  durationMs: 12,
});

const aiResponse = (text: string): AIResponse => ({
  text,
  content: [{ text }],
  metadata: {
    model: 'mock',
    provider: 'mock',
    finishReason: 'stop',
    usage: null,
  },
});

interface Stubs {
  ai: AIService;
  executeMock: ReturnType<typeof vi.fn>;
  observationService: ImageObservationService;
  observeMock: ReturnType<typeof vi.fn>;
}

const buildStubs = (
  llmText: string,
  observeImpl?: () => Promise<ImageObservationResult>
): Stubs => {
  const executeMock = vi.fn().mockResolvedValue(aiResponse(llmText));
  const ai: AIService = { execute: executeMock };

  const observeMock = vi
    .fn()
    .mockImplementation(observeImpl ?? (async () => buildObservationResult()));
  const observationService = {
    observe: observeMock,
  } as unknown as ImageObservationService;

  return { ai, executeMock, observationService, observeMock };
};

describe('MotionIdeaService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 3-5 ideas from a successful LLM response', async () => {
    const llm = JSON.stringify({
      ideas: [
        'subject jogs forward',
        'leaves rustle softly',
        'slow dolly-in',
        'ambient breeze',
      ],
    });
    const { ai, observationService } = buildStubs(llm);
    const service = new MotionIdeaService(ai, observationService);

    const result = await service.generate({ image: 'https://img/1.jpg' });

    expect(result.ideas).toHaveLength(4);
    expect(result.ideas[0]).toBe('subject jogs forward');
    expect(result.observationCached).toBe(false);
    expect(result.observationUsedFastPath).toBe(false);
  });

  it('builds a systemPrompt independent of the observation timestamp', async () => {
    // Invariant: observedAt is bookkeeping, not scene content. Two
    // observations differing only in timestamp must produce byte-identical
    // prompts — otherwise provider prompt caching and record/replay break.
    const llm = JSON.stringify({ ideas: ['a drifts', 'b sways', 'c glows'] });
    const observationAt = (iso: string) => async () => ({
      ...buildObservationResult(),
      observation: { ...buildObservation(), observedAt: new Date(iso) },
    });
    const first = buildStubs(llm, observationAt('2026-01-01T00:00:00.000Z'));
    const second = buildStubs(llm, observationAt('2026-06-15T12:34:56.789Z'));

    await new MotionIdeaService(first.ai, first.observationService).generate({
      image: 'https://img/1.jpg',
    });
    await new MotionIdeaService(second.ai, second.observationService).generate({
      image: 'https://img/1.jpg',
    });

    const firstPrompt = (
      first.executeMock.mock.calls[0] as [string, { systemPrompt: string }]
    )[1].systemPrompt;
    const secondPrompt = (
      second.executeMock.mock.calls[0] as [string, { systemPrompt: string }]
    )[1].systemPrompt;
    expect(firstPrompt).toBe(secondPrompt);
    expect(firstPrompt).not.toContain('observedAt');
  });

  it('uses caller-supplied observation without calling observe()', async () => {
    const llm = JSON.stringify({
      ideas: ['pan left slowly', 'subject exhales', 'subtle camera push'],
    });
    const { ai, observationService, observeMock } = buildStubs(llm);
    const service = new MotionIdeaService(ai, observationService);

    const result = await service.generate({
      image: 'https://img/2.jpg',
      observation: buildObservation(),
    });

    expect(observeMock).not.toHaveBeenCalled();
    expect(result.ideas).toHaveLength(3);
  });

  it('returns fallback ideas when the LLM returns invalid JSON', async () => {
    const { ai, observationService } = buildStubs('not json');
    const service = new MotionIdeaService(ai, observationService);

    const result = await service.generate({ image: 'https://img/3.jpg' });

    expect(result.ideas).toEqual([...MOTION_IDEAS_FALLBACK]);
  });

  it('returns fallback ideas when observation fails', async () => {
    const { ai, observationService } = buildStubs(
      JSON.stringify({ ideas: ['should not be used'] }),
      async () => {
        throw new Error('boom');
      }
    );
    const service = new MotionIdeaService(ai, observationService);

    const result = await service.generate({ image: 'https://img/4.jpg' });

    expect(result.ideas).toEqual([...MOTION_IDEAS_FALLBACK]);
  });

  it('clamps the LLM output to at most 5 ideas', async () => {
    const llm = JSON.stringify({
      ideas: [
        'idea 1',
        'idea 2',
        'idea 3',
        'idea 4',
        'idea 5',
        'idea 6',
        'idea 7',
      ],
    });
    const { ai, observationService } = buildStubs(llm);
    const service = new MotionIdeaService(ai, observationService);

    const result = await service.generate({ image: 'https://img/5.jpg' });

    expect(result.ideas).toHaveLength(5);
    expect(result.ideas[4]).toBe('idea 5');
  });
});
