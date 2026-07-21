import { describe, expect, it } from 'vitest';
import { dashboardRecord, paginatedRecords, percentageBoundaries } from './factories.js';

describe('test factories', () => {
  it('creates deterministic-shaped unique records', () => {
    const first = dashboardRecord(); const second = dashboardRecord({ actual: 0 });
    expect(first.id).not.toBe(second.id); expect(second.actual).toBe(0);
  });
  it('covers pagination and percentage boundaries', () => {
    expect(paginatedRecords(26)).toHaveLength(26); expect(percentageBoundaries).toContain(34.99);
  });
});
