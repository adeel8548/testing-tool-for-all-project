import type { Page } from '@playwright/test';

export async function mockJson(page: Page, url: string | RegExp, body: unknown, status = 200, delayMs = 0): Promise<void> {
  await page.route(url, async route => {
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}
