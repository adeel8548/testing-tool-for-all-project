import { expect, test } from '@playwright/test';
import { readEnvironment, requireCredential } from '../../src/config/environment.js';
import { ExecutiveOverviewPage } from '../../src/pages/executive-overview-page.js';
import { LoginPage } from '../../src/pages/login-page.js';

const environment = readEnvironment();
test.describe('Executive Overview Dashboard - Admin - true E2E', () => {
  test.skip(!environment.runIntegratedTests || !environment.runAuthTests,
    'Requires an isolated Admin test account and configured target selectors.');

  test('Admin login, MTD, stock filter and KPI calculation', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.signIn(requireCredential('TEST_USER_EMAIL'), requireCredential('TEST_USER_PASSWORD'));
    await expect(page).not.toHaveURL(new RegExp(environment.loginPath));

    const dashboard = new ExecutiveOverviewPage(page);
    await dashboard.goto();
    await dashboard.expectLoaded();
    await dashboard.selectMtd();
    await dashboard.expectVisitCompliance();
    const before = await dashboard.values();
    await dashboard.selectStockType('Cold');
    await expect.poll(() => dashboard.values()).not.toEqual(before);
    await dashboard.expectVisitCompliance();
  });
});
