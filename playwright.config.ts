import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });
dotenv.config();

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 2 } : {}),
  timeout: 30_000,
  expect: { timeout: 7_500 },
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000
  },
  projects: [
    { name: 'mocked', testMatch: /.*\.mocked\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'integrated', testMatch: /.*\.integrated\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium', testIgnore: [/.*\.mocked\.spec\.ts/, /.*\.integrated\.spec\.ts/], use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', testMatch: /.*\.responsive\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    { name: 'tablet', testMatch: /.*\.responsive\.spec\.ts/, use: { ...devices['iPad (gen 7)'] } }
  ]
});
