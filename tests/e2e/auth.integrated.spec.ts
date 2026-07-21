import { expect, test } from '@playwright/test';
import { readEnvironment, requireCredential } from '../../src/config/environment.js';
import { LoginPage } from '../../src/pages/login-page.js';

const environment = readEnvironment();
test.describe('real authentication (opt-in)', () => {
  test.skip(!environment.runIntegratedTests || !environment.runAuthTests,
    'Set RUN_INTEGRATED_TESTS=true and RUN_AUTH_TESTS=true with isolated test credentials.');

  test('protected route redirects and a test user can sign in', async ({ page }) => {
    await page.goto(environment.protectedPath);
    await expect(page).toHaveURL(new RegExp(environment.loginPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const login = new LoginPage(page);
    await login.expectPasswordMasked();
    await login.signIn(requireCredential('TEST_USER_EMAIL'), requireCredential('TEST_USER_PASSWORD'));
    await expect(page).toHaveURL(new RegExp(environment.protectedPath));
  });
});
