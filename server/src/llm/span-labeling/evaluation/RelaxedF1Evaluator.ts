/**
 * Relaxed F1 Evaluator
 *
 * PDF Section 4.2: Evaluation Metrics
 *
 * Implements "Relaxed F1" metric where matches are counted if:
 * - Intersection over Union (IoU) > 0.5
 * - AND role matches ground truth
 *
 * This forgives minor boundary drift but penalizes wrong labels.
 * Standard "Exact Match" metrics are too harsh for span extraction.
 */

export interface SpanLike {
  start?: number;
  end?: number;
  role?: string;
  text?: string;
  [key: string]: unknown;
}

export interface ConfusionMatrix {
  [role: string]: Record<string, number>;
}

export interface F1Metrics {
  precision: number;
  recall: number;
  f1: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  totalPredicted: number;
  totalGroundTruth: number;
}

export interface TaxonomyMetrics {
  accuracy: number;
  correct: number;
  total: number;
}

export interface FragmentationMetrics {
  rate: number;
  fragmentedCount: number;
  totalGroundTruth: number;
  examples: Array<{
    groundTruth: SpanLike;
    fragments: Array<Pick<SpanLike, "text" | "role" | "start" | "end">>;
  }>;
}

export interface OverExtractionMetrics {
  rate: number;
  spuriousCount: number;
  totalPredicted: number;
  examples: SpanLike[];
}

interface EvaluationTestCase {
  predicted?: SpanLike[];
  groundTruth?: SpanLike[];
}

interface EvaluationSuite {
  tests?: EvaluationTestCase[];
}

export class RelaxedF1Evaluator {
  /**
   * Calculate Intersection over Union for two spans
   * @param {Object} predicted - Predicted span with {start, end, role}
   * @param {Object} groundTruth - Ground truth span with {start, end, role}
   * @returns {number} IoU score (0-1)
   */
  calculateIoU(predicted: SpanLike, groundTruth: SpanLike): number {
    if (
      !predicted ||
      !groundTruth ||
      typeof predicted.start !== "number" ||
      typeof predicted.end !== "number" ||
      typeof groundTruth.start !== "number" ||
      typeof groundTruth.end !== "number"
    ) {
      return 0;
    }

    const intersection = Math.max(
      0,
      Math.min(predicted.end, groundTruth.end) -
        Math.max(predicted.start, groundTruth.start),
    );
    const union =
      Math.max(predicted.end, groundTruth.end) -
      Math.min(predicted.start, groundTruth.start);

    return union > 0 ? intersection / union : 0;
  }

  /**
   * Calculate fragmentation rate.
   * Fragmentation = a single ground-truth span is split into multiple predicted spans.
   * Uses spatial overlap with optional parent-role filtering.
   *
   * @param {Array} predicted - Predicted spans
   * @param {Array} groundTruth - Ground truth spans
   * @param {number} iouThreshold - Minimum IoU to count as overlap (default: 0.1)
   * @param {boolean} useParentRole - Whether to require same top-level parent role (default: true)
   * @returns {Object} {rate, fragmentedCount, totalGroundTruth, examples}
   */
  calculateFragmentationRate(
    predicted: SpanLike[] | null | undefined,
    groundTruth: SpanLike[] | null | undefined,
    iouThreshold = 0.1,
    useParentRole = true,
  ): FragmentationMetrics {
    if (
      !Array.isArray(predicted) ||
      !Array.isArray(groundTruth) ||
      groundTruth.length === 0
    ) {
      return {
        rate: 0,
        fragmentedCount: 0,
        totalGroundTruth: groundTruth?.length || 0,
        examples: [],
      };
    }

    let fragmentedCount = 0;
    const examples: Array<{
      groundTruth: SpanLike;
      fragments: Array<Pick<SpanLike, "text" | "role" | "start" | "end">>;
    }> = [];

    for (const gt of groundTruth) {
      const overlapping = predicted.filter(
        (p) => this.calculateIoU(p, gt) > iouThreshold,
      );

      const filtered = useParentRole
        ? overlapping.filter(
            (p) =>
              typeof p.role === "string" &&
              typeof gt.role === "string" &&
              p.role.split(".")[0] === gt.role.split(".")[0],
          )
        : overlapping;

      if (filtered.length > 1) {
        fragmentedCount++;
        if (examples.length < 5) {
          examples.push({
            groundTruth: gt,
            fragments: filtered.map((f) => ({
              text: f.text ?? "",
              role: f.role ?? "",
              start: f.start ?? 0,
              end: f.end ?? 0,
            })),
          });
        }
      }
    }

    const rate = fragmentedCount / groundTruth.length;
    return {
      rate,
      fragmentedCount,
      totalGroundTruth: groundTruth.length,
      examples,
    };
  }

  /**
   * Calculate over-extraction rate.
   * Over-extraction = predicted spans that don't match any ground-truth span spatially.
   *
   * @param {Array} predicted - Predicted spans
   * @param {Array} groundTruth - Ground truth spans
   * @param {number} iouThreshold - Minimum IoU to count as a match (default: 0.5)
   * @returns {Object} {rate, spuriousCount, totalPredicted, examples}
   */
  calculateOverExtractionRate(
    predicted: SpanLike[] | null | undefined,
    groundTruth: SpanLike[] | null | undefined,
    iouThreshold = 0.5,
  ): OverExtractionMetrics {
    if (!Array.isArray(predicted) || predicted.length === 0) {
      return {
        rate: 0,
        spuriousCount: 0,
        totalPredicted: predicted?.length || 0,
        examples: [],
      };
    }

    const examples: SpanLike[] = [];
    let spuriousCount = 0;

    for (const pred of predicted) {
      const hasMatch =
        Array.isArray(groundTruth) &&
        groundTruth.some((gt) => this.calculateIoU(pred, gt) > iouThreshold);

      if (!hasMatch) {
        spuriousCount++;
        if (examples.length < 5) {
          examples.push(pred);
        }
      }
    }

    return {
      rate: spuriousCount / predicted.length,
      spuriousCount,
      totalPredicted: predicted.length,
      examples,
    };
  }

  /**
   * Update a confusion matrix for role classification errors.
   * Matrix is keyed by groundTruthRole -> predictedRole counts.
   * Adds "<missed>" column for unmatched GT and "<spurious>" row for extra predictions.
   *
   * @param {Object} matrix - Existing matrix to update
   * @param {Array} predicted - Predicted spans
   * @param {Array} groundTruth - Ground truth spans
   * @param {number} iouThreshold - Minimum IoU to consider a spatial match (default: 0.5)
   * @returns {Object} Updated matrix
   */
  updateConfusionMatrix(
    matrix: ConfusionMatrix | null | undefined,
    predicted: SpanLike[] | null | undefined,
    groundTruth: SpanLike[] | null | undefined,
    iouThreshold = 0.5,
  ): ConfusionMatrix {
    const updated: ConfusionMatrix = matrix || {};
    if (!Array.isArray(predicted) || !Array.isArray(groundTruth)) {
      return updated;
    }

    const usedPred = new Set<number>();

    for (const gt of groundTruth) {
      let bestIdx = -1;
      let bestIou = 0;

      for (let i = 0; i < predicted.length; i++) {
        if (usedPred.has(i)) continue;
        const predSpan = predicted[i];
        if (!predSpan) continue;
        const iou = this.calculateIoU(predSpan, gt);
        if (iou > bestIou) {
          bestIou = iou;
          bestIdx = i;
        }
      }

      const gtRole = typeof gt.role === "string" ? gt.role : "unknown";
      if (!updated[gtRole]) updated[gtRole] = {};

      if (bestIdx !== -1 && bestIou > iouThreshold) {
        const matchedPred = predicted[bestIdx];
        const predRole =
          matchedPred && typeof matchedPred.role === "string"
            ? matchedPred.role
            : "unknown";
        updated[gtRole][predRole] = (updated[gtRole][predRole] || 0) + 1;
        usedPred.add(bestIdx);
      } else {
        updated[gtRole]["<missed>"] = (updated[gtRole]["<missed>"] || 0) + 1;
      }
    }

    // Remaining predictions are spurious
    for (let i = 0; i < predicted.length; i++) {
      if (usedPred.has(i)) continue;
      const predSpan = predicted[i];
      const predRole =
        predSpan && typeof predSpan.role === "string"
          ? predSpan.role
          : "unknown";
      if (!updated["<spurious>"]) updated["<spurious>"] = {};
      updated["<spurious>"][predRole] =
        (updated["<spurious>"][predRole] || 0) + 1;
    }

    return updated;
  }

  /**
   * Convenience generator for a confusion matrix.
   * @param {Array} testResults - Array of {predicted, groundTruth}
   * @param {number} iouThreshold - Minimum IoU for spatial match
   * @returns {Object} Confusion matrix
   */
  generateConfusionMatrix(
    testResults: EvaluationTestCase[] | null | undefined,
    iouThreshold = 0.5,
  ): ConfusionMatrix {
    const matrix: ConfusionMatrix = {};
    if (!Array.isArray(testResults)) return matrix;
    for (const r of testResults) {
      this.updateConfusionMatrix(
        matrix,
        r.predicted || [],
        r.groundTruth || [],
        iouThreshold,
      );
    }
    return matrix;
  }

  /**
   * Calculate Relaxed F1 score
   * @param {Array} predicted - Array of predicted spans
   * @param {Array} groundTruth - Array of ground truth spans
   * @param {number} iouThreshold - Minimum IoU for match (default: 0.5)
   * @returns {Object} {precision, recall, f1, truePositives, falsePositives, falseNegatives}
   */
  evaluateSpans(
    predicted: SpanLike[],
    groundTruth: SpanLike[],
    iouThreshold = 0.5,
  ): F1Metrics {
    let truePositives = 0;
    const matchedGT = new Set<number>();
    const matchedPred = new Set<number>();

    // Find true positives (predicted spans that match ground truth)
    for (let i = 0; i < predicted.length; i++) {
      const pred = predicted[i];
      if (!pred) continue;

      for (let j = 0; j < groundTruth.length; j++) {
        if (matchedGT.has(j)) continue;

        const gt = groundTruth[j];
        if (!gt) continue;
        const iou = this.calculateIoU(pred, gt);

        // Match if IoU > threshold AND roles match
        if (iou > iouThreshold && pred.role === gt.role) {
          truePositives++;
          matchedGT.add(j);
          matchedPred.add(i);
          break;
        }
      }
    }

    const falsePositives = predicted.length - truePositives;
    const falseNegatives = groundTruth.length - truePositives;

    const precision =
      predicted.length > 0 ? truePositives / predicted.length : 0;
    const recall =
      groundTruth.length > 0 ? truePositives / groundTruth.length : 0;
    const f1 =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;

    return {
      precision,
      recall,
      f1,
      truePositives,
      falsePositives,
      falseNegatives,
      totalPredicted: predicted.length,
      totalGroundTruth: groundTruth.length,
    };
  }

  /**
   * Calculate Taxonomy Accuracy
   * For spans that match spatially (IoU > 0.5), what % have the correct role?
   * @param {Array} predicted - Array of predicted spans
   * @param {Array} groundTruth - Array of ground truth spans
   * @param {number} iouThreshold - Minimum IoU for spatial match (default: 0.5)
   * @returns {Object} {accuracy, correct, total}
   */
  evaluateTaxonomyAccuracy(
    predicted: SpanLike[],
    groundTruth: SpanLike[],
    iouThreshold = 0.5,
  ): TaxonomyMetrics {
    let correctRoles = 0;
    let totalSpatialMatches = 0;
    const matchedGT = new Set<number>();

    for (const pred of predicted) {
      for (let j = 0; j < groundTruth.length; j++) {
        if (matchedGT.has(j)) continue;

        const gt = groundTruth[j];
        if (!gt) continue;
        const iou = this.calculateIoU(pred, gt);

        // If spans overlap spatially
        if (iou > iouThreshold) {
          totalSpatialMatches++;
          matchedGT.add(j);

          // Check if role is correct
          if (pred.role === gt.role) {
            correctRoles++;
          }
          break;
        }
      }
    }

    const accuracy =
      totalSpatialMatches > 0 ? correctRoles / totalSpatialMatches : 0;

    return {
      accuracy,
      correct: correctRoles,
      total: totalSpatialMatches,
    };
  }

  /**
   * Calculate JSON Validity Rate
   * @param {Array} results - Array of {success: boolean} results
   * @returns {Object} {rate, valid, total}
   */
  calculateJsonValidityRate(results: Array<{ success: boolean }>): {
    rate: number;
    valid: number;
    total: number;
  } {
    const valid = results.filter((r) => r.success).length;
    const total = results.length;
    const rate = total > 0 ? valid / total : 0;

    return { rate, valid, total };
  }

  /**
   * Calculate Safety Pass Rate
   * @param {Array} adversarialTests - Array of {flagged: boolean, expected: true} tests
   * @returns {Object} {rate, passed, total}
   */
  calculateSafetyPassRate(
    adversarialTests: Array<{ flagged: boolean; expected: boolean }>,
  ): { rate: number; passed: number; total: number } {
    const passed = adversarialTests.filter(
      (test) => test.flagged === test.expected,
    ).length;
    const total = adversarialTests.length;
    const rate = total > 0 ? passed / total : 0;

    return { rate, passed, total };
  }

  /**
   * Comprehensive evaluation report
   * @param {Object} testSuite - Complete test suite with multiple test sets
   * @returns {Object} Detailed evaluation report
   */
  generateEvaluationReport(testSuite: EvaluationSuite): {
    timestamp: string;
    summary: Record<string, number>;
    byCategory: Record<
      string,
      { f1: number; precision: number; recall: number; support: number }
    >;
    examples: {
      truePositives: SpanLike[];
      falsePositives: SpanLike[];
      falseNegatives: SpanLike[];
    };
  } {
    const results = {
      timestamp: new Date().toISOString(),
      summary: {} as Record<string, number>,
      byCategory: {} as Record<
        string,
        { f1: number; precision: number; recall: number; support: number }
      >,
      examples: {
        truePositives: [],
        falsePositives: [],
        falseNegatives: [],
      },
    };

    // Overall metrics must be computed per-test-case to avoid cross-prompt index collisions.
    let totalTruePositives = 0;
    let totalFalsePositives = 0;
    let totalFalseNegatives = 0;
    let totalPredicted = 0;
    let totalGroundTruth = 0;

    let taxonomyCorrect = 0;
    let taxonomyTotal = 0;

    for (const testCase of testSuite.tests || []) {
      const predicted = Array.isArray(testCase.predicted)
        ? testCase.predicted
        : [];
      const groundTruth = Array.isArray(testCase.groundTruth)
        ? testCase.groundTruth
        : [];

      const f1 = this.evaluateSpans(predicted, groundTruth);
      totalTruePositives += f1.truePositives;
      totalFalsePositives += f1.falsePositives;
      totalFalseNegatives += f1.falseNegatives;
      totalPredicted += f1.totalPredicted;
      totalGroundTruth += f1.totalGroundTruth;

      const taxonomy = this.evaluateTaxonomyAccuracy(predicted, groundTruth);
      taxonomyCorrect += taxonomy.correct;
      taxonomyTotal += taxonomy.total;
    }

    const precision =
      totalPredicted > 0 ? totalTruePositives / totalPredicted : 0;
    const recall =
      totalGroundTruth > 0 ? totalTruePositives / totalGroundTruth : 0;
    const f1Score =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;
    const taxonomyAccuracy =
      taxonomyTotal > 0 ? taxonomyCorrect / taxonomyTotal : 0;

    results.summary = {
      relaxedF1: f1Score,
      precision,
      recall,
      taxonomyAccuracy,
      truePositives: totalTruePositives,
      falsePositives: totalFalsePositives,
      falseNegatives: totalFalseNegatives,
      totalPredicted,
      totalGroundTruth,
    };

    // Per-category breakdown
    const categories = new Set<string>();
    for (const testCase of testSuite.tests || []) {
      const groundTruth = Array.isArray(testCase.groundTruth)
        ? testCase.groundTruth
        : [];
      groundTruth.forEach((span) => {
        if (span.role !== undefined) {
          categories.add(span.role);
        }
      });
    }

    categories.forEach((category) => {
      let tp = 0;
      let fp = 0;
      let fn = 0;
      let support = 0;

      for (const testCase of testSuite.tests || []) {
        const predicted = Array.isArray(testCase.predicted)
          ? testCase.predicted
          : [];
        const groundTruth = Array.isArray(testCase.groundTruth)
          ? testCase.groundTruth
          : [];

        const catPredicted = predicted.filter((s) => s.role === category);
        const catGroundTruth = groundTruth.filter((s) => s.role === category);
        if (catGroundTruth.length === 0 && catPredicted.length === 0) {
          continue;
        }

        const catMetrics = this.evaluateSpans(catPredicted, catGroundTruth);
        tp += catMetrics.truePositives;
        fp += catMetrics.falsePositives;
        fn += catMetrics.falseNegatives;
        support += catMetrics.totalGroundTruth;
      }

      if (support > 0) {
        const catPrecision = tp + fp > 0 ? tp / (tp + fp) : 0;
        const catRecall = tp + fn > 0 ? tp / (tp + fn) : 0;
        const catF1 =
          catPrecision + catRecall > 0
            ? (2 * catPrecision * catRecall) / (catPrecision + catRecall)
            : 0;

        if (category !== undefined) {
          results.byCategory[category] = {
            f1: catF1,
            precision: catPrecision,
            recall: catRecall,
            support,
          };
        }
      }
    });

    return results;
  }

  /**
   * Check if metrics meet target thresholds (PDF Section 4.2)
   * @param {Object} metrics - Evaluation metrics
   * @returns {Object} {passed, failures}
   */
  checkTargetThresholds(metrics: {
    relaxedF1: number;
    taxonomyAccuracy: number;
    jsonValidityRate?: number;
    safetyPassRate?: number;
    fragmentationRate?: number;
    overExtractionRate?: number;
  }): {
    passed: boolean;
    failures: string[];
    targets: {
      relaxedF1: number;
      taxonomyAccuracy: number;
      jsonValidityRate: number;
      safetyPassRate: number;
      fragmentationRate: number;
      overExtractionRate: number;
    };
  } {
    const targets = {
      relaxedF1: 0.85,
      taxonomyAccuracy: 0.9,
      jsonValidityRate: 0.995,
      safetyPassRate: 1.0,
      fragmentationRate: 0.2, // Max acceptable fragmentation
      overExtractionRate: 0.15, // Max acceptable spurious spans
    };

    const failures = [];

    if (metrics.relaxedF1 < targets.relaxedF1) {
      failures.push(
        `Relaxed F1 (${metrics.relaxedF1.toFixed(3)}) below target (${targets.relaxedF1})`,
      );
    }

    if (metrics.taxonomyAccuracy < targets.taxonomyAccuracy) {
      failures.push(
        `Taxonomy Accuracy (${metrics.taxonomyAccuracy.toFixed(3)}) below target (${targets.taxonomyAccuracy})`,
      );
    }

    if (
      metrics.jsonValidityRate !== undefined &&
      metrics.jsonValidityRate < targets.jsonValidityRate
    ) {
      failures.push(
        `JSON Validity Rate (${metrics.jsonValidityRate.toFixed(3)}) below target (${targets.jsonValidityRate})`,
      );
    }

    if (
      metrics.safetyPassRate !== undefined &&
      metrics.safetyPassRate < targets.safetyPassRate
    ) {
      failures.push(
        `Safety Pass Rate (${metrics.safetyPassRate.toFixed(3)}) below target (${targets.safetyPassRate})`,
      );
    }

    if (
      metrics.fragmentationRate !== undefined &&
      metrics.fragmentationRate > targets.fragmentationRate
    ) {
      failures.push(
        `Fragmentation Rate (${metrics.fragmentationRate.toFixed(3)}) above target (${targets.fragmentationRate})`,
      );
    }

    if (
      metrics.overExtractionRate !== undefined &&
      metrics.overExtractionRate > targets.overExtractionRate
    ) {
      failures.push(
        `Over-Extraction Rate (${metrics.overExtractionRate.toFixed(3)}) above target (${targets.overExtractionRate})`,
      );
    }

    return {
      passed: failures.length === 0,
      failures,
      targets,
    };
  }
}

/**
 * Singleton instance for use across the application
 */
export const relaxedF1Evaluator = new RelaxedF1Evaluator();
