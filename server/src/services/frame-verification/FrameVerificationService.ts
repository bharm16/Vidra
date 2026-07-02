/**
 * FrameVerificationService
 *
 * Thin orchestrator: validates the request and delegates the judging
 * to SpanVerdictService. No business logic here.
 */

import { logger } from '@infrastructure/Logger';
import type { SpanVerdictService } from './services/SpanVerdictService';
import type {
  FrameVerificationRequest,
  FrameVerificationResult,
} from './types';

export class FrameVerificationService {
  private readonly spanVerdictService: SpanVerdictService;
  private readonly log = logger.child({ service: 'FrameVerificationService' });

  constructor(spanVerdictService: SpanVerdictService) {
    this.spanVerdictService = spanVerdictService;
  }

  async verify(
    request: FrameVerificationRequest
  ): Promise<FrameVerificationResult> {
    if (!request.image) {
      throw new Error('Frame verification requires an image');
    }
    if (request.spans.length === 0) {
      throw new Error('Frame verification requires at least one span');
    }

    const startTime = performance.now();
    const { verdicts, model } = await this.spanVerdictService.judge(
      request.image,
      request.spans
    );
    const durationMs = Math.round(performance.now() - startTime);

    this.log.info('Frame verified', {
      spanCount: request.spans.length,
      model,
      durationMs,
    });

    return { verdicts, model, durationMs };
  }
}
