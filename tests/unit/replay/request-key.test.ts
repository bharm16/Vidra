import { describe, expect, it } from 'vitest';
import {
  aiModelRequestKey,
  imagePreviewRequestKey,
  stableStringify,
} from '@server/replay/requestKey';

describe('replay request keys', () => {
  const baseRequest = {
    operation: 'span_labeling',
    systemPrompt: 'label the spans',
    userMessage: 'a cat sleeping on a windowsill',
    messages: null,
    stream: false,
  };

  it('is deterministic for the same logical request', () => {
    expect(aiModelRequestKey({ ...baseRequest })).toBe(
      aiModelRequestKey({ ...baseRequest })
    );
  });

  it('is insensitive to object property order', () => {
    const reordered = {
      stream: false,
      messages: null,
      userMessage: 'a cat sleeping on a windowsill',
      systemPrompt: 'label the spans',
      operation: 'span_labeling',
    };
    expect(aiModelRequestKey(reordered)).toBe(aiModelRequestKey(baseRequest));
  });

  it('changes when the semantic request changes', () => {
    const key = aiModelRequestKey(baseRequest);
    expect(
      aiModelRequestKey({ ...baseRequest, userMessage: 'a dog' })
    ).not.toBe(key);
    expect(
      aiModelRequestKey({ ...baseRequest, operation: 'optimize_standard' })
    ).not.toBe(key);
    expect(aiModelRequestKey({ ...baseRequest, stream: true })).not.toBe(key);
  });

  it('namespaces the two seams so keys can never collide', () => {
    expect(aiModelRequestKey(baseRequest).startsWith('ai-model:')).toBe(true);
    expect(
      imagePreviewRequestKey({
        prompt: 'a cat',
        aspectRatio: null,
        inputImageUrl: null,
        seed: null,
        speedMode: null,
      }).startsWith('image-preview:')
    ).toBe(true);
  });

  it('stableStringify sorts nested keys and drops undefined values', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 }, skip: undefined })).toBe(
      '{"a":{"c":3,"d":2},"b":1}'
    );
  });
});
