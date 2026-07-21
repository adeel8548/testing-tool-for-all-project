import type { Page, TestInfo } from '@playwright/test';

const ignoredPatterns = [/favicon\.ico/i];

export function monitorPageQuality(page: Page, testInfo: TestInfo): () => Promise<void> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => {
    if (!ignoredPatterns.some(pattern => pattern.test(request.url()))) {
      failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`);
    }
  });

  return async () => {
    const report = { consoleErrors, pageErrors, failedRequests };
    await testInfo.attach('browser-quality.json', {
      body: Buffer.from(JSON.stringify(report, null, 2)), contentType: 'application/json'
    });
    if (consoleErrors.length || pageErrors.length || failedRequests.length) {
      throw new Error(`Browser quality failures:\n${JSON.stringify(report, null, 2)}`);
    }
  };
}
