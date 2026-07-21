import { expect, test } from '@playwright/test';
import { readEnvironment } from '../../src/config/environment.js';

const environment = readEnvironment();
test.describe('real API health (opt-in, read-only)', () => {
  test.skip(!environment.runIntegratedTests, 'Set RUN_INTEGRATED_TESTS=true to call the configured test environment.');

  test('API responds without a server error', async ({ request }) => {
    const response = await request.get(environment.apiBaseUrl, {
      headers: process.env.TEST_API_TOKEN ? { Authorization: `Bearer ${process.env.TEST_API_TOKEN}` } : {}
    });
    expect(response.status()).toBeLessThan(500);
  });
});
