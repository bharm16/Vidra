import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AIResponse, IAIClient } from '@interfaces/IAIClient';
import { CassetteStore } from '@server/replay/CassetteStore';
import {
  ReplayCassetteMissError,
  ReplayContractViolationError,
} from '@server/replay/errors';
import { RecordReplayAiService } from '@server/replay/RecordReplayAiService';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'replay-seam-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

const MOTION_IDEAS_JSON =
  '{"ideas":["slow dolly-in","curtains sway","dust drifts"]}';
const SPAN_JSON =
  '{"analysis_trace":"one subject","spans":[{"text":"a cat","role":"subject.identity","confidence":0.9}],"meta":{"version":"1","notes":""}}';

function fakeClient({
  text,
  onComplete,
}: {
  text: string;
  onComplete?: () => void;
}): IAIClient {
  return {
    complete: vi.fn(async (): Promise<AIResponse> => {
      onComplete?.();
      return { text, metadata: { provider: 'fake', model: 'fake-model' } };
    }),
    streamComplete: vi.fn(
      async (
        _systemPrompt: string,
        options: { onChunk: (chunk: string) => void }
      ): Promise<string> => {
        const mid = Math.floor(text.length / 2);
        options.onChunk(text.slice(0, mid));
        options.onChunk(text.slice(mid));
        return text;
      }
    ),
  };
}

const NO_CLIENTS = { openai: null, groq: null, qwen: null, gemini: null };

describe('RecordReplayAiService', () => {
  it('records execute() through the live path, then replays with zero network', async () => {
    const dir = makeTempDir();
    const liveCalls = vi.fn();
    const groq = fakeClient({ text: MOTION_IDEAS_JSON, onComplete: liveCalls });

    const recordStore = new CassetteStore({ fixturesDir: dir });
    recordStore.beginScenario('motion-ideas', 'seam-roundtrip');
    const recorder = new RecordReplayAiService({
      clients: { ...NO_CLIENTS, groq },
      mode: 'record',
      store: recordStore,
    });

    const params = {
      systemPrompt: 'generate motion ideas',
      userMessage: 'a cat on a windowsill',
    };
    const recorded = await recorder.execute('i2v_motion_ideas', params);
    expect(recorded.text).toBe(MOTION_IDEAS_JSON);
    expect(liveCalls).toHaveBeenCalledTimes(1);
    recordStore.flush();

    // Replay: no clients at all — any network attempt would throw upstream.
    const replayStore = new CassetteStore({ fixturesDir: dir });
    replayStore.loadAll();
    const replayer = new RecordReplayAiService({
      clients: { ...NO_CLIENTS },
      mode: 'replay',
      store: replayStore,
    });

    const replayed = await replayer.execute('i2v_motion_ideas', params);
    expect(replayed.text).toBe(MOTION_IDEAS_JSON);
    expect(liveCalls).toHaveBeenCalledTimes(1);
  });

  it('throws a loud miss when the request diverges from the recording', async () => {
    const dir = makeTempDir();
    const recordStore = new CassetteStore({ fixturesDir: dir });
    recordStore.beginScenario('motion-ideas', 'seam-miss');
    const recorder = new RecordReplayAiService({
      clients: { ...NO_CLIENTS, groq: fakeClient({ text: MOTION_IDEAS_JSON }) },
      mode: 'record',
      store: recordStore,
    });
    await recorder.execute('i2v_motion_ideas', {
      systemPrompt: 'generate motion ideas',
      userMessage: 'a cat on a windowsill',
    });
    recordStore.flush();

    const replayStore = new CassetteStore({ fixturesDir: dir });
    replayStore.loadAll();
    const replayer = new RecordReplayAiService({
      clients: { ...NO_CLIENTS },
      mode: 'replay',
      store: replayStore,
    });

    await expect(
      replayer.execute('i2v_motion_ideas', {
        systemPrompt: 'generate motion ideas',
        userMessage: 'a DIFFERENT prompt',
      })
    ).rejects.toThrow(ReplayCassetteMissError);
  });

  it('record mode fails loudly when the provider answer violates the contract', async () => {
    const recordStore = new CassetteStore({ fixturesDir: makeTempDir() });
    recordStore.beginScenario('motion-ideas', 'bad-provider-answer');
    const recorder = new RecordReplayAiService({
      clients: {
        ...NO_CLIENTS,
        groq: fakeClient({ text: '{"wrong":"shape"}' }),
      },
      mode: 'record',
      store: recordStore,
    });

    await expect(
      recorder.execute('i2v_motion_ideas', {
        systemPrompt: 'generate motion ideas',
        userMessage: 'a cat',
      })
    ).rejects.toThrow(ReplayContractViolationError);
  });

  it('records and replays stream() deterministically', async () => {
    const dir = makeTempDir();
    const gemini = fakeClient({ text: SPAN_JSON });

    const recordStore = new CassetteStore({ fixturesDir: dir });
    recordStore.beginScenario('label-spans', 'stream-roundtrip');
    const recorder = new RecordReplayAiService({
      clients: { ...NO_CLIENTS, gemini },
      mode: 'record',
      store: recordStore,
    });

    const recordedChunks: string[] = [];
    const recordedText = await recorder.stream('span_labeling_gemini', {
      systemPrompt: 'label the spans',
      userMessage: 'a cat',
      onChunk: (chunk: string) => recordedChunks.push(chunk),
    });
    expect(recordedText).toBe(SPAN_JSON);
    expect(recordedChunks.join('')).toBe(SPAN_JSON);
    recordStore.flush();

    const replayStore = new CassetteStore({ fixturesDir: dir });
    replayStore.loadAll();
    const replayer = new RecordReplayAiService({
      clients: { ...NO_CLIENTS },
      mode: 'replay',
      store: replayStore,
    });

    const replayChunks: string[] = [];
    const replayedText = await replayer.stream('span_labeling_gemini', {
      systemPrompt: 'label the spans',
      userMessage: 'a cat',
      onChunk: (chunk: string) => replayChunks.push(chunk),
    });
    expect(replayedText).toBe(SPAN_JSON);
    expect(replayChunks.join('')).toBe(SPAN_JSON);
    expect(replayer.supportsStreaming('span_labeling_gemini')).toBe(true);
  });
});
