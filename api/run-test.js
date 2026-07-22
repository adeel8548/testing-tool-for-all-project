/* global process, URL, Buffer, setTimeout, clearTimeout, document, CSS, fetch, AbortSignal */
import { lookup } from 'node:dns/promises';
import { timingSafeEqual } from 'node:crypto';
import chromiumPack from '@sparticuz/chromium';
import { chromium } from 'playwright-core';

export const config = { maxDuration: 300 };

const PRIVATE_V4 = /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const PRIVATE_V6 = /^(::1$|::$|fc|fd|fe80)/i;
const LOGOUT_PATH = /(?:^|\/)(?:logout|log-out|signout|sign-out|logoff|log-off)(?:\/|$)/i;

function crawlCandidate(raw, origin) {
  try {
    const candidate = new URL(raw, origin);
    candidate.hash = '';
    if (candidate.origin !== origin || LOGOUT_PATH.test(candidate.pathname)) return null;
    return candidate;
  } catch { return null; }
}

function authorized(request) {
  const expected = process.env.PLATFORM_ACCESS_KEY;
  const received = request.headers['x-platform-key'];
  if (!expected || typeof received !== 'string') return false;
  const left = Buffer.from(received); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function safeUrl(raw, expectedOrigin) {
  let target;
  try { target = new URL(raw); } catch { throw new Error('Enter a valid absolute URL.'); }
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Only HTTP and HTTPS targets are supported.');
  if (target.username || target.password) throw new Error('Do not place credentials inside the URL.');
  if (expectedOrigin && target.origin !== expectedOrigin) throw new Error('Login and target URLs must use the same origin.');
  const hostname = target.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Hosted scans cannot access localhost or private hostnames. Use the local runner.');
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => PRIVATE_V4.test(address) || PRIVATE_V6.test(address))) {
    throw new Error('Private and loopback network targets are blocked.');
  }
  return target;
}

function locatorFor(page, kind, configured) {
  if (configured) return page.locator(configured).first();
  if (kind === 'identifier') return page.locator('input[type="email"], input[name*="email" i], input[name*="user" i], input[id*="email" i], input[id*="user" i], input[autocomplete="username"], input[type="text"]').first();
  return page.locator('input[type="password"], input[autocomplete="current-password"]').first();
}

async function login(page, loginConfig, origin) {
  const identifier = loginConfig?.identifier || loginConfig?.email;
  if (!identifier || !loginConfig?.password) return { attempted: false };
  const loginTarget = await safeUrl(loginConfig.url || origin, origin);
  await page.goto(loginTarget.href, { waitUntil: 'domcontentloaded' });
  const identifierField = locatorFor(page, 'identifier', loginConfig.identifierSelector || loginConfig.emailSelector);
  const password = locatorFor(page, 'password', loginConfig.passwordSelector);
  await identifierField.fill(identifier);
  await password.fill(loginConfig.password);
  const submit = loginConfig.submitSelector
    ? page.locator(loginConfig.submitSelector).first()
    : page.getByRole('button', { name: /sign in|log in|login|continue|submit/i }).first();
  await submit.click();
  await page.waitForURL(url => url.href !== loginTarget.href, { timeout: 12_000 }).catch(() => {});
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  const finalUrl = page.url();
  return { attempted: true, finalUrl, leftLoginPage: finalUrl !== loginTarget.href };
}

async function auditPage(page, targetUrl) {
  const started = Date.now();
  const consoleErrors = []; const pageErrors = []; const failedRequests = []; const apiCalls = [];
  const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500)); };
  const onPageError = error => pageErrors.push(error.message.slice(0, 500));
  const onRequestFailed = request => failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText || 'failed'}`);
  const onResponse = response => {
    const request = response.request();
    if (['fetch', 'xhr'].includes(request.resourceType()) && apiCalls.length < 100) {
      apiCalls.push({ method: request.method(), url: response.url(), status: response.status(), ok: response.ok() });
    }
  };
  page.on('console', onConsole); page.on('pageerror', onPageError); page.on('requestfailed', onRequestFailed); page.on('response', onResponse);
  let response;
  try {
    response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    const menuTriggers = page.locator('[aria-haspopup="menu"], button[aria-controls], [role="button"][aria-controls], summary');
    const triggerCount = Math.min(await menuTriggers.count(), 20);
    for (let index = 0; index < triggerCount; index += 1) {
      const trigger = menuTriggers.nth(index);
      if (!await trigger.isVisible().catch(() => false)) continue;
      await trigger.hover().catch(() => {});
      const expanded = await trigger.getAttribute('aria-expanded');
      if (expanded !== 'true') await trigger.click({ timeout: 1500 }).catch(() => {});
    }
    const facts = await page.evaluate(() => {
      const visible = element => Boolean(element.getClientRects().length);
      const images = [...document.images];
      const controls = [...document.querySelectorAll('input,select,textarea')].filter(visible);
      const unlabeledControls = controls.filter(control => {
        const id = control.getAttribute('id');
        return !control.getAttribute('aria-label') && !control.getAttribute('aria-labelledby') &&
          !control.closest('label') && !(id && document.querySelector(`label[for="${CSS.escape(id)}"]`));
      }).length;
      const unnamedButtons = [...document.querySelectorAll('button')].filter(button =>
        visible(button) && !(button.textContent || '').trim() && !button.getAttribute('aria-label') && !button.getAttribute('title')).length;
      return {
        title: document.title,
        headings: document.querySelectorAll('h1').length,
        links: document.querySelectorAll('a[href]').length,
        forms: document.forms.length,
        brokenImages: images.filter(image => image.complete && image.naturalWidth === 0).length,
        missingAlt: images.filter(image => !image.hasAttribute('alt')).length,
        unlabeledControls,
        unnamedButtons,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        passwordFieldsUnmasked: document.querySelectorAll('input[name*="password" i]:not([type="password"])').length
      };
    });
    const checks = [
      ['HTTP response is successful', Boolean(response && response.status() < 400), `Status ${response?.status() ?? 'unknown'}`, 'critical'],
      ['Document has a title', Boolean(facts.title.trim()), facts.title || 'Missing title', 'warning'],
      ['Page has a primary heading', facts.headings > 0, `${facts.headings} h1 element(s)`, 'warning'],
      ['Images load successfully', facts.brokenImages === 0, `${facts.brokenImages} broken image(s)`, 'failed'],
      ['Images have alt attributes', facts.missingAlt === 0, `${facts.missingAlt} image(s) without alt`, 'warning'],
      ['Form controls have labels', facts.unlabeledControls === 0, `${facts.unlabeledControls} unlabeled control(s)`, 'warning'],
      ['Buttons have accessible names', facts.unnamedButtons === 0, `${facts.unnamedButtons} unnamed button(s)`, 'warning'],
      ['No horizontal page overflow', !facts.overflow, facts.overflow ? 'Overflow detected' : 'No overflow', 'failed'],
      ['Password fields are masked', facts.passwordFieldsUnmasked === 0, `${facts.passwordFieldsUnmasked} unmasked field(s)`, 'critical'],
      ['No unhandled page errors', pageErrors.length === 0, `${pageErrors.length} page error(s)`, 'critical'],
      ['No console errors', consoleErrors.length === 0, `${consoleErrors.length} console error(s)`, 'warning'],
      ['No failed network requests', failedRequests.length === 0, `${failedRequests.length} failed request(s)`, 'failed']
    ].map(([name, passed, detail, severity]) => ({ name, passed, detail, severity }));
    const links = await page.locator('a[href], [role="menuitem"][href], option[value], [data-href]').evaluateAll((elements, base) => elements
      .map(element => element.getAttribute('href') || element.getAttribute('data-href') || element.getAttribute('value'))
      .filter(value => value && (/^(https?:|\/|\.\.\/|\.\/)/i.test(value)))
      .map(value => { try { return new URL(value, base).href; } catch { return null; } })
      .filter(Boolean), targetUrl);
    return {
      url: page.url(), title: facts.title, status: response?.status() ?? null, durationMs: Date.now() - started,
      checks, facts, consoleErrors, pageErrors, failedRequests: failedRequests.slice(0, 20), apiCalls, links
    };
  } finally {
    page.off('console', onConsole); page.off('pageerror', onPageError); page.off('requestfailed', onRequestFailed); page.off('response', onResponse);
  }
}

async function sitemapUrls(target, limit) {
  try {
    const sitemap = await safeUrl(new URL('/sitemap.xml', target.origin).href, target.origin);
    const response = await fetch(sitemap, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/xml,text/xml' } });
    if (!response.ok) return [];
    await safeUrl(response.url, target.origin);
    const xml = (await response.text()).slice(0, 2_000_000);
    return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
      .map(match => match[1].replaceAll('&amp;', '&').trim())
      .filter(Boolean)
      .slice(0, limit);
  } catch { return []; }
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') return response.status(405).json({ error: 'Use POST.' });
  if (!process.env.PLATFORM_ACCESS_KEY) return response.status(503).json({ error: 'Platform access key is not configured.' });
  if (!authorized(request)) return response.status(401).json({ error: 'Invalid platform access key.' });

  let browser;
  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    const target = await safeUrl(body?.targetUrl);
    const maxPages = Math.min(Math.max(Number(body?.maxPages) || 5, 1), 25);
    if (body?.login?.url) await safeUrl(body.login.url, target.origin);
    const timeout = setTimeout(() => browser?.close().catch(() => {}), 270_000);
    const executablePath = process.env.VERCEL ? await chromiumPack.executablePath() : undefined;
    browser = await chromium.launch({
      args: process.env.VERCEL ? chromiumPack.args : [], executablePath,
      headless: true
    });
    const context = await browser.newContext({ ignoreHTTPSErrors: false, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(12_000); page.setDefaultNavigationTimeout(25_000);
    const loginResult = await login(page, body.login, target.origin);

    const requestedUrls = Array.isArray(body?.pageUrls) ? body.pageUrls.slice(0, maxPages) : [];
    const discoveredUrls = await sitemapUrls(target, maxPages);
    const startingUrls = [];
    if (loginResult.attempted && loginResult.leftLoginPage) {
      const dashboard = await safeUrl(loginResult.finalUrl, target.origin);
      dashboard.hash = '';
      startingUrls.push(dashboard.href);
    }
    if (!startingUrls.includes(target.href)) startingUrls.push(target.href);
    const queue = [...startingUrls]; const queued = new Set(queue); const visited = new Set(); const pages = [];
    const linkOccurrences = new Map();
    for (const raw of [...requestedUrls, ...discoveredUrls]) {
      const candidate = crawlCandidate(raw, target.origin);
      if (candidate && !queued.has(candidate.href)) {
        queue.push(candidate.href); queued.add(candidate.href);
      }
    }
    while (queue.length && pages.length < maxPages) {
      const next = queue.shift();
      if (!next || visited.has(next)) continue;
      const safe = await safeUrl(next, target.origin);
      visited.add(safe.href);
      const result = await auditPage(page, safe.href);
      pages.push(result);
      for (const link of result.links) {
        const candidate = crawlCandidate(link, target.origin);
        if (candidate) {
          const occurrence = linkOccurrences.get(candidate.href) || { count: 0, pages: new Set() };
          occurrence.count += 1; occurrence.pages.add(result.url); linkOccurrences.set(candidate.href, occurrence);
        }
        if (candidate && !queued.has(candidate.href)) {
          queue.push(candidate.href); queued.add(candidate.href);
        }
      }
    }
    clearTimeout(timeout);
    const checks = pages.flatMap(item => item.checks);
    const duplicateUrls = [...linkOccurrences.entries()]
      .filter(([, occurrence]) => occurrence.count > 1)
      .map(([url, occurrence]) => ({ url, occurrences: occurrence.count, foundOn: [...occurrence.pages] }));
    const criticalIssues = pages.flatMap(item => item.checks
      .filter(check => !check.passed && check.severity === 'critical')
      .map(check => ({ page: item.url, issue: check.name, detail: check.detail })));
    const apiIssues = pages.flatMap(item => item.apiCalls
      .filter(call => !call.ok)
      .map(call => ({ page: item.url, ...call })));
    const report = {
      id: `run-${Date.now()}`, target: target.origin, startedAt: new Date().toISOString(),
      login: loginResult, pagesScanned: pages.length, passed: checks.filter(item => item.passed).length,
      warnings: checks.filter(item => !item.passed && item.severity === 'warning').length,
      failed: checks.filter(item => !item.passed && item.severity === 'failed').length,
      critical: checks.filter(item => !item.passed && item.severity === 'critical').length,
      criticalIssues, apiIssues, duplicateUrls, pages
    };
    return response.status(200).json(report);
  } catch (error) {
    return response.status(400).json({ error: error instanceof Error ? error.message : 'Test run failed.' });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
