import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const asset = (name: string) => readFileSync(resolve(process.cwd(), 'public', name), 'utf8');

test.describe('live audit execution', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('http://audit.local/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/health') return route.fulfill({ json: { status: 'ok', workerConfigured: true } });
      if (url.pathname === '/api/run-test') {
        const body = route.request().postDataJSON();
        expect(body.login.password).toBe('private-password');
        const events = [
          { id: 1, runId: 'audit_test', timestamp: new Date().toISOString(), type: 'audit_created', stage: 'queued', status: 'queued', target: 'https://target.example', message: 'Audit run created' },
          { id: 2, runId: 'audit_test', timestamp: new Date().toISOString(), type: 'route_discovered', stage: 'discovering_routes', status: 'waiting', url: 'https://target.example/dashboard', totalPages: 1, message: 'Route discovered: /dashboard' },
          { id: 3, runId: 'audit_test', timestamp: new Date().toISOString(), type: 'page_started', stage: 'page_audit', status: 'testing', pageIndex: 1, totalPages: 1, url: 'https://target.example/dashboard', message: 'Testing dashboard' },
          { id: 4, runId: 'audit_test', timestamp: new Date().toISOString(), type: 'page_preview', stage: 'page_audit', status: 'information', preview: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', message: 'Live page preview updated' },
          { id: 5, runId: 'audit_test', timestamp: new Date().toISOString(), type: 'check_completed', stage: 'page_audit', status: 'passed', pageIndex: 1, totalPages: 1, checkIndex: 1, totalChecks: 1, check: 'HTTP response', message: 'HTTP response passed' },
          { id: 5, runId: 'audit_test', timestamp: new Date().toISOString(), type: 'workflow_discovered', stage: 'page_audit', status: 'warning', action: 'Add user', classification: 'data-changing', verification: 'configuration_required', testDataIdentifier: 'AUTO_TEST_123', cleanupStatus: 'Not required', message: 'Add user discovered' },
          { id: 6, runId: 'audit_test', timestamp: new Date().toISOString(), type: 'audit_completed', stage: 'completed', status: 'completed', progress: 100, message: 'Audit completed', report: { runId: 'audit_test', pagesScanned: 1, passed: 1, warnings: 0, failed: 0, critical: 0, workflowsFound: 1, skippedUnsafeWorkflows: 1, duplicateUrls: [], pages: [{ title: 'Dashboard', url: 'https://target.example/dashboard', status: 200, checks: [{ name: 'HTTP response', passed: true, detail: 'Status 200' }], apiCalls: [], actions: [], features: [], validationIssues: [] }] } }
        ];
        return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: `${events.map(event => JSON.stringify(event)).join('\n')}\n` });
      }
      if (url.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: asset('app.js') });
      if (url.pathname.endsWith('.css')) return route.fulfill({ contentType: 'text/css', body: asset(url.pathname.slice(1)) });
      return route.fulfill({ contentType: 'text/html', body: asset('index.html') });
    });
  });

  test('shows backend events and transitions to the final report without exposing credentials', async ({ page }) => {
    await page.goto('http://audit.local/');
    await page.getByLabel('Platform access key *').fill('platform-secret');
    await page.getByLabel('Application URL *').fill('https://target.example');
    await page.getByLabel('Read-only', { exact: true }).check();
    await page.getByText('Authenticated login').click();
    await page.getByLabel('Email or username').fill('auditor');
    await page.getByLabel('Test password').fill('private-password');
    await page.getByRole('button', { name: 'Run full audit' }).click();
    await expect(page.getByText('Audit completed', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Audit report' })).toBeVisible();
    await expect(page.locator('#route-list')).toContainText('/dashboard');
    await expect(page.locator('#current-action')).toHaveText('Add user');
    await expect(page.locator('#page-preview')).toBeVisible();
    await expect(page.locator('#activity-log')).not.toContainText('private-password');
    await expect(page).toHaveURL(/\/audit\/audit_test$/);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download complete JSON report' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('audit_test-complete-audit-report.json');
    const downloadedReport = JSON.parse(readFileSync((await download.path())!, 'utf8'));
    expect(JSON.stringify(downloadedReport)).not.toContain('private-password');
    expect(downloadedReport.auditExecutionLog.length).toBeGreaterThan(0);
  });

  test('requires explicit confirmation for a data-changing mode', async ({ page }) => {
    await page.goto('http://audit.local/');
    await page.getByLabel('Platform access key *').fill('platform-secret');
    await page.getByLabel('Application URL *').fill('https://target.example');
    await page.getByLabel('Full safe CRUD test').check();
    await page.getByLabel('Create and modify only audit-generated records').check();
    await page.getByRole('button', { name: 'Run full audit' }).click();
    await expect(page.getByRole('status')).toContainText('Confirm that this is an authorized test environment');
  });
});
