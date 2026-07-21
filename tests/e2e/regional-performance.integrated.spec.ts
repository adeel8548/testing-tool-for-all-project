import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow } from '../../src/browser/page-audit.js';
import { monitorPageQuality } from '../../src/browser/quality-monitor.js';
import { readEnvironment, requireCredential } from '../../src/config/environment.js';
import { LoginPage } from '../../src/pages/login-page.js';
import { RegionalPerformancePage } from '../../src/pages/regional-performance-page.js';

const environment = readEnvironment();
const enabled = environment.runIntegratedTests && environment.runAuthTests;

test.describe('Regional Performance - real Admin application behavior', () => {
  test.skip(!enabled, 'Configure BASE_URL, isolated Admin credentials, and enable integrated/auth tests.');

  test('blocks anonymous access and permits an authenticated Admin', async ({ browser }) => {
    const anonymous = await browser.newPage();
    await anonymous.goto(process.env.REGIONAL_PERFORMANCE_PATH ?? '/regional-performance');
    await expect(anonymous).toHaveURL(new RegExp(environment.loginPath));
    await anonymous.close();

    const page = await browser.newPage();
    const login = new LoginPage(page);
    await login.goto();
    await login.signIn(process.env.TEST_ADMIN_EMAIL?.trim() || requireCredential('TEST_USER_EMAIL'),
      process.env.TEST_ADMIN_PASSWORD?.trim() || requireCredential('TEST_USER_PASSWORD'));
    const regional = new RegionalPerformancePage(page);
    await regional.goto();
    await regional.expectLoaded();
    await page.close();
  });

  test('loads the real API, filters data, validates calculations and cross-widget consistency', async ({ page }, testInfo) => {
    const assertBrowserQuality = monitorPageQuality(page, testInfo);
    const login = new LoginPage(page);
    await login.goto();
    await login.signIn(process.env.TEST_ADMIN_EMAIL?.trim() || requireCredential('TEST_USER_EMAIL'),
      process.env.TEST_ADMIN_PASSWORD?.trim() || requireCredential('TEST_USER_PASSWORD'));

    const apiPath = process.env.REGIONAL_PERFORMANCE_API_PATH ?? '/api/regional-performance';
    const responsePromise = page.waitForResponse(response => response.url().includes(apiPath));
    const regional = new RegionalPerformancePage(page);
    await regional.goto();
    const response = await responsePromise;
    expect(response.ok(), `regional API returned ${response.status()}`).toBe(true);
    await regional.expectLoaded();
    await regional.expectRankingsAndCalculations();
    await regional.expectCrossWidgetConsistency();

    const availableRegions = await regional.regionFilter.locator('option').allTextContents();
    const region = availableRegions.find(value => value.trim() && value.trim().toLowerCase() !== 'all');
    expect(region, 'at least one regional filter option is required').toBeTruthy();
    const before = await regional.rows.allTextContents();
    await regional.selectRegion(region!);
    await expect.poll(() => regional.rows.allTextContents()).not.toEqual(before);
    await expect(regional.rows).toContainText(region!);
    await expectNoHorizontalOverflow(page);
    await assertBrowserQuality();
  });
});
