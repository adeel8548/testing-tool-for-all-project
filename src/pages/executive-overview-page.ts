import { expect, type Page } from '@playwright/test';
import { isWithinTolerance, percentage } from '../domain/metrics.js';

const numberFrom = (text: string): number => {
  const parsed = Number(text.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(parsed)) throw new Error(`Cannot parse numeric KPI value from: ${text}`);
  return parsed;
};

export class ExecutiveOverviewPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> { await this.page.goto(process.env.DASHBOARD_PATH ?? '/executive-overview'); }

  async expectLoaded(): Promise<void> {
    await expect(this.page.getByRole('heading', {
      name: process.env.DASHBOARD_HEADING ?? 'Executive Overview'
    })).toBeVisible();
    await expect(this.kpi(process.env.PLANNED_VISITS_LABEL ?? 'Planned Visits')).toBeVisible();
    await expect(this.kpi(process.env.ACTUAL_VISITS_LABEL ?? 'Actual Visits')).toBeVisible();
  }

  async selectMtd(): Promise<void> {
    await this.page.getByRole('button', { name: process.env.MTD_FILTER_NAME ?? 'MTD' }).click();
  }

  async selectStockType(stockType: 'Cold' | 'Warm' | 'Combined'): Promise<void> {
    await this.page.getByLabel(process.env.STOCK_FILTER_LABEL ?? 'Stock type').selectOption({ label: stockType });
  }

  async expectVisitCompliance(tolerance = 0.01): Promise<void> {
    const planned = numberFrom(await this.kpi(process.env.PLANNED_VISITS_LABEL ?? 'Planned Visits').innerText());
    const actual = numberFrom(await this.kpi(process.env.ACTUAL_VISITS_LABEL ?? 'Actual Visits').innerText());
    const displayed = numberFrom(await this.kpi(process.env.VISIT_COMPLIANCE_LABEL ?? 'Visit Compliance').innerText());
    const expected = percentage(actual, planned);
    expect(expected, 'planned visits must be greater than zero').not.toBeNull();
    expect(isWithinTolerance(displayed, expected!, tolerance),
      `expected ${actual} / ${planned} × 100 = ${expected}%, received ${displayed}%`).toBe(true);
  }

  async values(): Promise<{ planned: string; actual: string; compliance: string }> {
    return {
      planned: await this.kpi(process.env.PLANNED_VISITS_LABEL ?? 'Planned Visits').innerText(),
      actual: await this.kpi(process.env.ACTUAL_VISITS_LABEL ?? 'Actual Visits').innerText(),
      compliance: await this.kpi(process.env.VISIT_COMPLIANCE_LABEL ?? 'Visit Compliance').innerText()
    };
  }

  private kpi(name: string) {
    return this.page.getByRole('region', { name }).getByTestId('kpi-value');
  }
}
