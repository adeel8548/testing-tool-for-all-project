import { expect, test } from '@playwright/test';
import { expectDocumentBasics, monitorPageQuality } from '../../src/index.js';

test.describe('PAGE_NAME', () => {
  test('loads and meets baseline quality checks', async ({ page }, testInfo) => {
    const assertQuality = monitorPageQuality(page, testInfo);
    await page.goto('/REPLACE_ROUTE');
    await expect(page.getByRole('heading', { name: 'REPLACE_HEADING' })).toBeVisible();
    await expectDocumentBasics(page);
    await assertQuality();
  });
});
