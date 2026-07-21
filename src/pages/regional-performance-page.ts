import { expect, type Page } from '@playwright/test';
import { isWithinTolerance, percentage } from '../domain/metrics.js';

const numeric = (value: string): number => {
  const result = Number(value.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(result)) throw new Error(`Unable to parse number from "${value}"`);
  return result;
};

export class RegionalPerformancePage {
  constructor(private readonly page: Page) {}

  get table() { return this.page.getByRole('table', { name: process.env.REGIONAL_TABLE_NAME ?? 'Regional rankings' }); }
  get rows() { return this.table.getByRole('row').filter({ has: this.page.getByRole('cell') }); }
  get regionFilter() {
    return this.page.getByRole('combobox', { name: new RegExp(process.env.REGION_FILTER_LABEL ?? 'Region', 'i') });
  }

  async goto(): Promise<void> { await this.page.goto(process.env.REGIONAL_PERFORMANCE_PATH ?? '/regional-performance'); }

  async expectLoaded(): Promise<void> {
    await expect(this.page.getByRole('heading', {
      name: process.env.REGIONAL_PERFORMANCE_HEADING ?? 'Regional Performance'
    })).toBeVisible();
    await expect(this.table).toBeVisible();
  }

  async selectRegion(region: string): Promise<void> { await this.regionFilter.selectOption({ label: region }); }

  async sortByScore(): Promise<void> {
    await this.table.getByRole('button', { name: /execution score/i }).click();
  }

  async nextPage(): Promise<void> { await this.page.getByRole('button', { name: /next/i }).click(); }

  async expectRankingsAndCalculations(): Promise<void> {
    const rows = this.rows;
    const count = await rows.count();
    expect(count, 'regional table must contain data rows').toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const cells = rows.nth(index).getByRole('cell');
      expect(numeric(await cells.nth(0).innerText())).toBe(index + 1);
      const planned = numeric(await cells.nth(2).innerText());
      const actual = numeric(await cells.nth(3).innerText());
      const displayedScore = numeric(await cells.nth(4).innerText());
      const expectedScore = percentage(actual, planned);
      expect(expectedScore, `planned value must be positive for row ${index + 1}`).not.toBeNull();
      expect(isWithinTolerance(displayedScore, expectedScore!, 0.01),
        `row ${index + 1}: expected ${actual}/${planned} × 100 = ${expectedScore}%, received ${displayedScore}%`).toBe(true);
    }
  }

  async expectCrossWidgetConsistency(): Promise<void> {
    const chart = this.page.getByRole('region', { name: process.env.REGIONAL_CHART_NAME ?? 'Regional performance chart' });
    const rows = this.rows;
    for (let index = 0; index < await rows.count(); index += 1) {
      const cells = rows.nth(index).getByRole('cell');
      const region = (await cells.nth(1).innerText()).trim();
      const score = numeric(await cells.nth(4).innerText());
      await expect(chart.getByTestId(`chart-${region}`)).toHaveText(`${score.toFixed(2)}%`);
    }
    const tableScores = await rows.evaluateAll(items => items.map(row =>
      Number((row.querySelectorAll('td')[4]?.textContent ?? '').replace(/[^0-9.-]/g, ''))));
    const average = Math.round((tableScores.reduce((sum, score) => sum + score, 0) / tableScores.length) * 100) / 100;
    await expect(this.page.getByRole('region', { name: process.env.EXECUTION_SCORE_LABEL ?? 'Execution Score' }).getByTestId('kpi-value'))
      .toHaveText(`${average.toFixed(2)}%`);
  }
}
