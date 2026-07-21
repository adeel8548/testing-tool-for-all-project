import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow } from '../../src/browser/page-audit.js';

test.describe('responsive template', () => {
  test.skip(!process.env.BASE_URL, 'Set BASE_URL to enable target-application responsive checks.');
  test('main page has no document-level overflow', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
