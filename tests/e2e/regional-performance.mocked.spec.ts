import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow } from '../../src/browser/page-audit.js';
import { monitorPageQuality } from '../../src/browser/quality-monitor.js';
import { RegionalPerformancePage } from '../../src/pages/regional-performance-page.js';
import { regionalPerformanceHtml as regionalAppHtml, regionalRows as regionalData } from '../fixtures/regional-performance-app.js';

async function servePage(page: import('@playwright/test').Page): Promise<void> {
  await page.route('http://qa.local/regional-performance', route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: regionalAppHtml }));
}

async function fulfillRegional(route: import('@playwright/test').Route): Promise<void> {
  const selected = new URL(route.request().url()).searchParams.get('region') ?? 'All';
  const data = selected === 'All' ? regionalData : regionalData.filter(row => row.region === selected);
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
}

test.describe('Regional Performance deterministic API states', () => {
  test.beforeEach(async ({ page }) => servePage(page));

  test('@smoke loads API data, rankings, KPI calculations and consistent widgets', async ({ page }, testInfo) => {
    const assertBrowserQuality = monitorPageQuality(page, testInfo);
    let requestCount = 0;
    await page.route('http://qa.local/api/regional-performance?*', async route => {
      requestCount += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(regionalData) });
    });
    const regional = new RegionalPerformancePage(page);
    await page.goto('http://qa.local/regional-performance');
    await regional.expectLoaded();
    expect(requestCount, 'page should not duplicate its initial API request').toBe(1);
    await regional.expectRankingsAndCalculations();
    await regional.expectCrossWidgetConsistency();
    await assertBrowserQuality();
  });

  test('filters, sorting and pagination update the displayed data', async ({ page }) => {
    await page.route('http://qa.local/api/regional-performance?*', route => {
      const selected = new URL(route.request().url()).searchParams.get('region');
      const data = selected && selected !== 'All'
        ? regionalData.filter(row => row.region === selected)
        : regionalData;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    const regional = new RegionalPerformancePage(page);
    await page.goto('http://qa.local/regional-performance');
    await regional.expectLoaded();

    await expect(regional.rows).toHaveCount(2);
    await regional.nextPage();
    await expect(regional.rows.first().getByRole('cell').nth(1)).toHaveText('South');
    await expect(page.getByText('Page 2')).toBeVisible();

    await regional.selectRegion('North');
    await expect(regional.rows).toHaveCount(1);
    await expect(regional.rows.first().getByRole('cell').nth(1)).toHaveText('North');
    await regional.selectRegion('All');
    await regional.sortByScore();
    await expect(regional.rows.first().getByRole('cell').nth(1)).toHaveText('East');
  });

  test('shows a loading state while the API is pending', async ({ page }) => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route('http://qa.local/api/regional-performance?*', async route => {
      await pending;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(regionalData) });
    });
    const navigation = page.goto('http://qa.local/regional-performance');
    await expect(page.getByRole('status')).toHaveText(/loading regional performance/i);
    release();
    await navigation;
    await expect(page.getByRole('status')).toBeHidden();
  });

  test('shows an explicit empty state for an empty API response', async ({ page }) => {
    await page.route('http://qa.local/api/regional-performance?*', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto('http://qa.local/regional-performance');
    await expect(page.getByText('No regional performance data')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Regional rankings' })).toBeHidden();
  });

  test('shows an understandable API failure without an unhandled exception', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('http://qa.local/api/regional-performance?*', route =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"failure"}' }));
    await page.goto('http://qa.local/regional-performance');
    await expect(page.getByRole('alert')).toHaveText('Unable to load regional performance');
    expect(pageErrors).toEqual([]);
  });

  test('supports keyboard access and responsive layouts', async ({ page }) => {
    await page.route('http://qa.local/api/regional-performance?*', fulfillRegional);
    for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.goto('http://qa.local/regional-performance');
      await expectNoHorizontalOverflow(page);
      await expect(page.getByRole('heading', { name: 'Regional Performance' })).toBeVisible();
      await page.getByRole('combobox', { name: /region/i }).focus();
      await expect(page.getByRole('combobox', { name: /region/i })).toBeFocused();
      await expect(page.getByRole('button', { name: 'Execution Score' })).toBeVisible();
    }
  });
});
