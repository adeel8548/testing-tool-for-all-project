export function percentage(actual: number | null, planned: number | null, decimals = 2): number | null {
  if (actual === null || planned === null || planned === 0) return null;
  const scale = 10 ** decimals;
  return Math.round((actual / planned) * 100 * scale) / scale;
}

export function isWithinTolerance(actual: number, expected: number, tolerance = 0.01): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

export type Threshold = { min: number; max: number; label: string };

export function validateThresholds(thresholds: Threshold[]): string[] {
  const errors: string[] = [];
  const sorted = [...thresholds].sort((a, b) => a.min - b.min);
  sorted.forEach((item, index) => {
    if (item.min > item.max) errors.push(`${item.label}: minimum exceeds maximum`);
    const next = sorted[index + 1];
    if (next && item.max >= next.min) errors.push(`${item.label} overlaps ${next.label}`);
  });
  return errors;
}
