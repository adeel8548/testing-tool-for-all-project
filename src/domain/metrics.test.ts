import { describe, expect, it } from 'vitest';
import { isWithinTolerance, percentage, validateThresholds } from './metrics.js';

describe('percentage', () => {
  it('calculates and rounds independently', () => expect(percentage(23626, 67109)).toBe(35.21));
  it('handles zero and null without Infinity or NaN', () => {
    expect(percentage(5, 0)).toBeNull();
    expect(percentage(null, 10)).toBeNull();
  });
  it('supports display tolerance', () => expect(isWithinTolerance(35.209, 35.21)).toBe(true));
});

describe('threshold validation', () => {
  it('detects overlapping ranges', () => {
    expect(validateThresholds([
      { min: 0, max: 50, label: 'Low' }, { min: 50, max: 100, label: 'High' }
    ])).toEqual(['Low overlaps High']);
  });
});
