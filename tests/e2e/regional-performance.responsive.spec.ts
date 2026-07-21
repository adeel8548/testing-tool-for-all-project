import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow } from '../../src/browser/page-audit.js';
import { RegionalPerformancePage } from '../../src/pages/regional-performance-page.js';
import { LoginPage } from '../../src/pages/login-page.js';
import { requireCredential } from '../../src/config/environment.js';

test.describe('Regional Performance responsive layout - real target', () => {
  test.skip(!process.env.BASE_URL || !process.env.RUN_AUTH_TESTS,
    'Requires configured authenticated test environment.');
  test('works at configured mobile and tablet viewport', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.signIn(process.env.TEST_ADMIN_EMAIL?.trim() || requireCredential('TEST_USER_EMAIL'),
      process.env.TEST_ADMIN_PASSWORD?.trim() || requireCredential('TEST_USER_PASSWORD'));
    const regional = new RegionalPerformancePage(page); await regional.goto();
    await expect(page.getByRole('heading', { name: process.env.REGIONAL_PERFORMANCE_HEADING ?? 'Regional Performance' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(regional.regionFilter).toBeVisible();
  });
});
