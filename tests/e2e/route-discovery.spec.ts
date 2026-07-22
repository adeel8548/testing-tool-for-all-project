import { expect, test } from '@playwright/test';
// @ts-expect-error The deployed Vercel function is JavaScript and intentionally has no declaration file.
import { crawlCandidate, discoverMenuRoutes } from '../../api/run-test.js';

test('excludes framework resources and API endpoints from the page audit queue', () => {
  expect(crawlCandidate('https://target.example/_next/image?url=%2Fimage.png', 'https://target.example')).toBeNull();
  expect(crawlCandidate('https://target.example/api/users', 'https://target.example')).toBeNull();
  expect(crawlCandidate('https://target.example/client/planogram', 'https://target.example')).toBeNull();
  expect(crawlCandidate('https://target.example/images/planogram.png', 'https://target.example')).toBeNull();
  expect(crawlCandidate('https://target.example/planogram', 'https://target.example')?.pathname).toBe('/planogram');
});

test('recursively discovers lazy nested navigation and skips destructive controls', async ({ page }) => {
  await page.setContent(`<!doctype html><html><body><nav aria-label="Main navigation">
    <button id="sidebar" aria-expanded="false" aria-controls="level-one">Open sidebar</button>
    <div id="level-one" hidden></div>
    <button id="delete" role="button" aria-expanded="false">Delete all data</button>
    <script>
      window.deleteClicked = false;
      document.querySelector('#delete').onclick = () => { window.deleteClicked = true; };
      document.querySelector('#sidebar').onclick = event => {
        event.currentTarget.setAttribute('aria-expanded', 'true');
        const level = document.querySelector('#level-one'); level.hidden = false;
        level.innerHTML = '<a href="/dashboard">Dashboard</a><button id="analytics" aria-expanded="false" aria-controls="level-two">Analytics</button><div id="level-two" hidden></div>';
        document.querySelector('#analytics').onclick = nested => {
          nested.currentTarget.setAttribute('aria-expanded', 'true');
          const second = document.querySelector('#level-two'); second.hidden = false;
          second.innerHTML = '<a href="/analytics/regional-performance">Regional Performance</a><a data-route="/analytics/sku-availability">SKU Availability</a>';
          const reactItem = document.createElement('div'); reactItem.textContent = 'Action Center'; reactItem.setAttribute('role', 'menuitem');
          reactItem['__reactProps$test'] = { onClick: () => window.history.pushState({}, '', '/analytics/action-center'), to: '/analytics/action-center' };
          second.append(reactItem);
        };
      };
    </script>
  </nav></body></html>`);
  const messages: string[] = [];
  const routes: string[] = await discoverMenuRoutes(page, 'https://target.example/dashboard', (_type: string, event: { message?: string }) => messages.push(event.message || ''));
  expect(routes).toEqual(expect.arrayContaining([
    'https://target.example/dashboard',
    'https://target.example/analytics/regional-performance',
    'https://target.example/analytics/sku-availability',
    'https://target.example/analytics/action-center'
  ]));
  expect(await page.evaluate(() => (window as typeof window & { deleteClicked: boolean }).deleteClicked)).toBe(false);
  expect(messages.some(message => message.includes('Expanding Analytics'))).toBe(true);
  expect(messages.some(message => message.includes('Recursive route discovery completed'))).toBe(true);
});
