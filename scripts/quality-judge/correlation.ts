/**
 * Spearman rank correlation with tie-aware ranking (average-rank method).
 * Required by the calibration gate at ρ ≥ 0.7.
 */
function rankAverageTies(xs: number[]): number[] {
  const indexed = xs.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);

  const ranks = new Array<number>(xs.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1]!.v === indexed[i]!.v) {
      j += 1;
    }
    // 1-based ranks; average across the tie group [i..j]
    const avg = (i + j + 2) / 2;
    for (let k = i; k <= j; k += 1) {
      ranks[indexed[k]!.i] = avg;
    }
    i = j + 1;
  }
  return ranks;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return 0;
  return num / Math.sqrt(denX * denY);
}

export function spearmanCorrelation(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length) {
    throw new Error(
      `spearmanCorrelation: length mismatch (${xs.length} vs ${ys.length})`,
    );
  }
  if (xs.some(Number.isNaN) || ys.some(Number.isNaN)) {
    throw new Error("spearmanCorrelation: NaN input is not permitted");
  }
  if (xs.length === 0) return 0;
  return pearson(rankAverageTies(xs), rankAverageTies(ys));
}

export function meanAbsoluteError(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length) {
    throw new Error(
      `meanAbsoluteError: length mismatch (${xs.length} vs ${ys.length})`,
    );
  }
  if (xs.some(Number.isNaN) || ys.some(Number.isNaN)) {
    throw new Error("meanAbsoluteError: NaN input is not permitted");
  }
  if (xs.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < xs.length; i += 1) {
    sum += Math.abs(xs[i]! - ys[i]!);
  }
  return sum / xs.length;
}
