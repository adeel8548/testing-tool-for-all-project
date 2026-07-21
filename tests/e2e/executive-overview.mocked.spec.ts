import { expect, test } from '@playwright/test';
import { ExecutiveOverviewPage } from '../../src/pages/executive-overview-page.js';

type Metrics = { planned: number; actual: number };
const responses: Record<string, Metrics> = {
  Combined: { planned: 67109, actual: 23626 },
  Cold: { planned: 20000, actual: 10000 },
  Warm: { planned: 12000, actual: 9000 }
};

const html = `<!doctype html><html><head><title>Executive Overview</title></head><body>
<main><h1>Executive Overview</h1><button type="button" id="mtd">MTD</button>
<label>Stock type<select id="stock"><option>Combined</option><option>Cold</option><option>Warm</option></select></label>
<section role="region" aria-label="Planned Visits"><h2>Planned Visits</h2><strong data-testid="kpi-value">Loading</strong></section>
<section role="region" aria-label="Actual Visits"><h2>Actual Visits</h2><strong data-testid="kpi-value">Loading</strong></section>
<section role="region" aria-label="Visit Compliance"><h2>Visit Compliance</h2><strong data-testid="kpi-value">Loading</strong></section>
<script>
const refresh=async()=>{const stock=document.querySelector('#stock').value;const period='MTD';
const response=await fetch('/api/executive-overview?period='+period+'&stockType='+stock);const data=await response.json();
const values=document.querySelectorAll('[data-testid=kpi-value]');values[0].textContent=data.planned.toLocaleString();
values[1].textContent=data.actual.toLocaleString();values[2].textContent=((data.actual/data.planned)*100).toFixed(2)+'%'};
document.querySelector('#mtd').onclick=refresh;document.querySelector('#stock').onchange=refresh;refresh();
</script></main></body></html>`;

test.describe('Executive Overview Dashboard - Admin - fully mocked', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('http://qa.local/executive-overview', route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: html }));
    await page.route('http://qa.local/api/executive-overview?*', async route => {
      const stock = new URL(route.request().url()).searchParams.get('stockType') ?? 'Combined';
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(responses[stock]) });
    });
  });

  test('@smoke loads, applies MTD and validates visit compliance', async ({ page }) => {
    const dashboard = new ExecutiveOverviewPage(page);
    await page.goto('http://qa.local/executive-overview');
    await dashboard.expectLoaded();
    await dashboard.selectMtd();
    await dashboard.expectVisitCompliance();
  });

  test('stock filters send correct queries and update all KPI values', async ({ page }) => {
    const dashboard = new ExecutiveOverviewPage(page);
    await page.goto('http://qa.local/executive-overview');
    await dashboard.expectLoaded();
    const initial = await dashboard.values();
    const coldResponse = page.waitForResponse(response => response.url().includes('stockType=Cold'));
    await dashboard.selectStockType('Cold');
    await coldResponse;
    await expect.poll(() => dashboard.values()).not.toEqual(initial);
    await dashboard.expectVisitCompliance();
    await expect(page.getByRole('region', { name: 'Visit Compliance' }).getByTestId('kpi-value')).toHaveText('50.00%');
  });
});
