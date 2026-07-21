import { expect, type Page } from '@playwright/test';

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow, 'page has unexpected horizontal overflow').toBe(false);
}

export async function expectImagesHealthy(page: Page): Promise<void> {
  const broken = await page.locator('img').evaluateAll(images => images
    .filter(image => !(image as HTMLImageElement).complete || (image as HTMLImageElement).naturalWidth === 0)
    .map(image => (image as HTMLImageElement).src));
  expect(broken, `broken images: ${broken.join(', ')}`).toEqual([]);
}

export async function expectDocumentBasics(page: Page): Promise<void> {
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page).toHaveTitle(/\S+/);
  await expectNoHorizontalOverflow(page);
  await expectImagesHealthy(page);
}
