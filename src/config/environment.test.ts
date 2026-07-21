import { describe, expect, it } from 'vitest';
import { readEnvironment } from './environment.js';

describe('readEnvironment', () => {
  it('uses safe defaults', () => {
    expect(readEnvironment({})).toMatchObject({
      baseUrl: 'http://127.0.0.1:3000', runIntegratedTests: false, allowMutations: false
    });
  });

  it('normalizes feature flags and API URL', () => {
    expect(readEnvironment({ BASE_URL: 'https://test.example/', RUN_INTEGRATED_TESTS: 'YES' }))
      .toMatchObject({ apiBaseUrl: 'https://test.example/api', runIntegratedTests: true });
  });
});
