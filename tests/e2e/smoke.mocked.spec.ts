import { expect, test } from '@playwright/test';
import { expectDocumentBasics } from '../../src/browser/page-audit.js';
import { percentage } from '../../src/domain/metrics.js';

const dashboardHtml = `<!doctype html><html><head><title>QA Dashboard</title></head>
<body><header><nav aria-label="Main navigation"><a href="/dashboard" aria-current="page">Dashboard</a></nav></header>
<main><h1>Executive Dashboard</h1><label>Stock type<select><option>Combined</option><option>Cold</option></select></label>
<section aria-label="Key metrics"><article><h2>Visit compliance</h2><strong data-testid="compliance">35.21%</strong></article></section>
<table><caption>Outlets</caption><thead><tr><th>Name</th><th>Actual</th></tr></thead><tbody><tr><td>QA Outlet</td><td>23,626</td></tr></tbody></table></main></body></html>`;

test.describe('fully mocked dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('http://qa.local/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: dashboardHtml }));
  });

  test('@smoke renders a healthy, accessible dashboard shell', async ({ page }) => {
    await page.goto('http://qa.local/dashboard');
    await expectDocumentBasics(page);
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Outlets' })).toBeVisible();
  });

  test('verifies KPI percentage independently', async ({ page }) => {
    await page.goto('http://qa.local/dashboard');
    const expected = percentage(23626, 67109);
    await expect(page.getByTestId('compliance')).toHaveText(`${expected}%`);
  });

  test('filter remains keyboard-accessible', async ({ page }) => {
    await page.goto('http://qa.local/dashboard');
    const filter = page.getByLabel('Stock type');
    await filter.selectOption('Cold');
    await expect(filter).toHaveValue('Cold');
  });
});
