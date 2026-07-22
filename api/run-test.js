/* global process, URL, Buffer, setTimeout, clearTimeout, document, CSS, fetch, AbortSignal */
import { lookup } from 'node:dns/promises';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import chromiumPack from '@sparticuz/chromium';
import { chromium } from 'playwright-core';

export const config = { maxDuration: 300 };

const PRIVATE_V4 = /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const PRIVATE_V6 = /^(::1$|::$|fc|fd|fe80)/i;
const LOGOUT_PATH = /(?:^|\/)(?:logout|log-out|signout|sign-out|logoff|log-off)(?:\/|$)/i;
const DESTRUCTIVE_PATH = /(?:^|\/)(?:delete|remove|destroy|purge|drop|truncate)(?:\/|$)/i;
const DOWNLOAD_FILE = /\.(?:zip|exe|dmg|pdf|csv|xlsx?|docx?|pptx?|tar|gz)(?:$|\?)/i;
const DESTRUCTIVE_ACTION = /\b(delete|remove|archive|reject|deactivate|disable|cancel order|refund)\b/i;
const DATA_ACTION = /\b(create|add|new|save|submit|edit|update|approve|assign|restore|activate|enable|upload|import)\b/i;
const SAFE_ACTION = /\b(view|open|search|filter|sort|next|previous|export|download|tab|details?)\b/i;

function classifyAction(label) {
  if (DESTRUCTIVE_ACTION.test(label)) return 'destructive';
  if (DATA_ACTION.test(label)) return 'data-changing';
  if (SAFE_ACTION.test(label)) return 'safe';
  return 'unknown';
}

function crawlCandidate(raw, origin) {
  try {
    const candidate = new URL(raw, origin);
    candidate.hash = '';
    if (candidate.pathname.length > 1) candidate.pathname = candidate.pathname.replace(/\/+$/, '');
    if (candidate.origin !== origin || LOGOUT_PATH.test(candidate.pathname) || DESTRUCTIVE_PATH.test(candidate.pathname) || DOWNLOAD_FILE.test(candidate.href)) return null;
    return candidate;
  } catch { return null; }
}

function safeObservedUrl(raw) {
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) {
      if (/token|secret|password|auth|key|session/i.test(key)) url.searchParams.set(key, '[REDACTED]');
    }
    return url.href;
  } catch { return String(raw).slice(0, 500); }
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

async function login(page, loginConfig, origin, emit) {
  const identifier = loginConfig?.identifier || loginConfig?.email;
  if (!identifier || !loginConfig?.password) return { attempted: false };
  emit('authentication_started', { stage: 'authenticating', message: 'Opening login page' });
  const loginTarget = await safeUrl(loginConfig.url || origin, origin);
  await page.goto(loginTarget.href, { waitUntil: 'domcontentloaded' });
  const cookiesBefore = await page.context().cookies(loginTarget.href);
  const identifierField = locatorFor(page, 'identifier', loginConfig.identifierSelector || loginConfig.emailSelector);
  const password = locatorFor(page, 'password', loginConfig.passwordSelector);
  emit('authentication_progress', { stage: 'authenticating', message: 'Login fields detected' });
  await identifierField.fill(identifier);
  await password.fill(loginConfig.password);
  const submit = loginConfig.submitSelector
    ? page.locator(loginConfig.submitSelector).first()
    : page.getByRole('button', { name: /sign in|log in|login|continue|submit/i }).first();
  await submit.click();
  await page.waitForURL(url => url.href !== loginTarget.href, { timeout: 12_000 }).catch(() => {});
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  const finalUrl = page.url();
  const cookiesAfter = await page.context().cookies(finalUrl);
  const authCookieAppeared = cookiesAfter.some(cookie => !cookiesBefore.some(before => before.name === cookie.name && before.value === cookie.value));
  const passwordStillVisible = await password.isVisible().catch(() => false);
  const loginErrorVisible = await page.locator('[role="alert"], .error, .alert-danger, [data-error]').filter({ visible: true }).count().catch(() => 0);
  const leftLoginPage = finalUrl !== loginTarget.href || authCookieAppeared || (!passwordStillVisible && loginErrorVisible === 0);
  emit(leftLoginPage ? 'authentication_succeeded' : 'authentication_failed', {
    stage: 'authenticating', status: leftLoginPage ? 'passed' : 'failed',
    message: leftLoginPage ? `Login succeeded; redirected to ${new URL(finalUrl).pathname}` : 'Authentication failed: login page did not redirect'
  });
  return { attempted: true, finalUrl, leftLoginPage };
}

async function visibleRouteCandidates(page, base) {
  return page.locator('a[href], [role="menuitem"][href], option[value], [data-href]').evaluateAll((elements, currentBase) => elements
    .map(element => element.getAttribute('href') || element.getAttribute('data-href') || element.getAttribute('value'))
    .filter(value => value && (/^(https?:|\/|\.\.\/|\.\/)/i.test(value)))
    .map(value => { try { return new URL(value, currentBase).href; } catch { return null; } })
    .filter(Boolean), base);
}

async function discoverMenuRoutes(page, base) {
  const routes = new Set(await visibleRouteCandidates(page, base));
  const selector = [
    '[aria-haspopup="menu"]', 'button[aria-controls]', '[role="button"][aria-controls]',
    '[data-bs-toggle="dropdown"]', '[data-toggle="dropdown"]', '.dropdown-toggle',
    '[data-menu-trigger]', 'nav li:has(ul)', '[role="navigation"] li:has(ul)', 'summary'
  ].join(', ');
  for (let pass = 0; pass < 2; pass += 1) {
    const triggers = page.locator(selector);
    const count = Math.min(await triggers.count(), 30);
    for (let index = 0; index < count; index += 1) {
      const trigger = triggers.nth(index);
      if (!await trigger.isVisible().catch(() => false)) continue;
      await trigger.hover().catch(() => {});
      const clickable = await trigger.evaluate(element => {
        if (element.matches('button,summary,[role="button"]')) return true;
        if (element.tagName === 'A') {
          const href = element.getAttribute('href') || '';
          return !href || href === '#' || href.startsWith('javascript:');
        }
        return element.matches('[aria-haspopup],[data-bs-toggle],[data-toggle],.dropdown-toggle,[data-menu-trigger]');
      })
        .catch(() => false);
      if (clickable && await trigger.getAttribute('aria-expanded') !== 'true') {
        await trigger.click({ timeout: 500 }).catch(() => {});
      }
      await page.waitForTimeout(30);
      for (const route of await visibleRouteCandidates(page, base)) routes.add(route);
    }
  }
  return [...routes];
}

async function auditPage(page, targetUrl, progress, workflowConfig = [], testDataIdentifier = '') {
  const started = Date.now();
  const consoleErrors = []; const pageErrors = []; const failedRequests = []; const apiCalls = [];
  const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500)); };
  const onPageError = error => pageErrors.push(error.message.slice(0, 500));
  const onRequestFailed = request => failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText || 'failed'}`);
  const onResponse = response => {
    const request = response.request();
    if (['fetch', 'xhr'].includes(request.resourceType()) && apiCalls.length < 100) {
      apiCalls.push({ method: request.method(), url: safeObservedUrl(response.url()), status: response.status(), ok: response.ok() });
    }
  };
  page.on('console', onConsole); page.on('pageerror', onPageError); page.on('requestfailed', onRequestFailed); page.on('response', onResponse);
  let response;
  try {
    progress('check_started', { check: 'Page navigation and HTTP response', checkIndex: 1, totalChecks: 12, message: 'Opening page and checking HTTP response' });
    response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    progress('check_started', { check: 'Authenticated route discovery', checkIndex: 2, totalChecks: 12, message: 'Opening navigation menus and discovering routes' });
    const links = await discoverMenuRoutes(page, targetUrl);
    progress('check_started', { check: 'DOM, accessibility and functional inspection', checkIndex: 3, totalChecks: 12, message: 'Inspecting page structure, controls, images and workflows' });
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
        passwordFieldsUnmasked: document.querySelectorAll('input[name*="password" i]:not([type="password"])').length,
        tables: document.querySelectorAll('table,[role="grid"]').length,
        dialogs: document.querySelectorAll('dialog,[role="dialog"]').length,
        actions: [...document.querySelectorAll('button,a[href],[role="button"],[role="menuitem"],input[type="submit"]')]
          .filter(visible)
          .slice(0, 100)
          .map(element => ({
            label: (element.getAttribute('aria-label') || element.textContent || element.getAttribute('value') || '').trim().slice(0, 160),
            tag: element.tagName.toLowerCase(), href: element.getAttribute('href') || null
          }))
          .filter(action => action.label),
        formDetails: [...document.forms].slice(0, 20).map((form, formIndex) => ({
          index: formIndex + 1, method: (form.method || 'get').toUpperCase(), action: form.action,
          fields: [...form.elements].filter(element => element.matches('input,select,textarea')).map(element => ({
            name: element.getAttribute('name') || element.getAttribute('id') || 'unnamed',
            type: element.getAttribute('type') || element.tagName.toLowerCase(), required: element.hasAttribute('required'),
            labelled: Boolean(element.getAttribute('aria-label') || element.getAttribute('aria-labelledby') || element.closest('label') || (element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`)))
          })),
          hasSubmit: Boolean(form.querySelector('button[type="submit"],input[type="submit"],button:not([type])'))
        }))
      };
    });
    const actions = facts.actions.map(action => {
      const classification = classifyAction(action.label);
      const pagePath = new URL(targetUrl).pathname;
      const configuration = workflowConfig.find(item => item && item.allowed === true &&
        (item.page === pagePath || item.page === targetUrl) && String(item.action || '').toLowerCase() === action.label.toLowerCase());
      return {
        ...action, classification, tested: false,
        configurationProvided: Boolean(configuration),
        verification: classification === 'safe' ? 'partially_verified' : configuration ? 'configuration_ready' : 'configuration_required',
        reason: classification === 'safe' ? 'Discovered during read-only inspection; business outcome was not inferred' : configuration ? 'Configuration supplied; an application-specific executor adapter is required' : 'Skipped until a controlled workflow and cleanup method are configured'
      };
    });
    for (const action of actions) progress('workflow_discovered', {
      action: action.label, classification: action.classification, verification: action.verification,
      testDataIdentifier, cleanupStatus: action.configurationProvided ? 'Configured, not executed' : 'Not required',
      status: action.classification === 'safe' ? 'information' : 'warning', message: `${action.label} · ${action.classification} · ${action.verification}`
    });
    const validationIssues = facts.formDetails.flatMap(form => [
      ...form.fields.filter(field => field.required && !field.labelled).map(field => `Form ${form.index}: required field "${field.name}" has no accessible label`),
      ...(!form.hasSubmit ? [`Form ${form.index}: no explicit submit control detected`] : [])
    ]);
    const features = [
      facts.forms ? `${facts.forms} form(s)` : null,
      facts.tables ? `${facts.tables} table/grid(s)` : null,
      facts.dialogs ? `${facts.dialogs} dialog(s)` : null,
      actions.length ? `${actions.length} visible action(s)` : null
    ].filter(Boolean);
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
    for (let index = 0; index < checks.length; index += 1) {
      const check = checks[index];
      progress('check_completed', {
        check: check.name, checkIndex: index + 1, totalChecks: checks.length,
        status: check.passed ? 'passed' : check.severity, message: check.name, details: { detail: check.detail }
      });
    }
    return {
      url: page.url(), title: facts.title, status: response?.status() ?? null, durationMs: Date.now() - started,
      checks, facts, features, actions, validationIssues, consoleErrors, pageErrors, failedRequests: failedRequests.slice(0, 20), apiCalls, links
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

  let body; let target;
  try {
    body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    target = await safeUrl(body?.targetUrl);
  } catch (error) {
    return response.status(400).json({ error: error instanceof Error ? error.message : 'Invalid audit request.' });
  }
  const runId = `audit_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const auditStartedAt = new Date();
  let eventId = 0; let cancelled = false; let timedOut = false;
  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.flushHeaders?.();
  const emit = (type, data = {}) => {
    if (response.destroyed || response.writableEnded) return;
    response.write(`${JSON.stringify({ id: ++eventId, runId, timestamp: new Date().toISOString(), type, ...data })}\n`);
  };
  response.on('close', () => { if (!response.writableEnded) cancelled = true; });
  emit('audit_created', { stage: 'queued', status: 'queued', message: 'Audit run created', target: target.origin });

  let browser;
  try {
    const maxPages = Math.min(Math.max(Number(body?.maxPages) || 5, 1), 25);
    const testingDepth = ['basic', 'functional', 'full-crud'].includes(body?.testingDepth) ? body.testingDepth : 'basic';
    const dataSafety = ['generated-only', 'read-only', 'disposable'].includes(body?.dataSafety) ? body.dataSafety : 'read-only';
    const testingMode = testingDepth !== 'full-crud' || dataSafety === 'read-only' ? 'read-only' : dataSafety === 'disposable' ? 'full-staging' : 'safe-crud';
    const testDataPrefix = /^[A-Za-z0-9_-]{3,32}$/.test(body?.testDataPrefix || '') ? body.testDataPrefix : 'AUTO_TEST';
    const workflowConfig = Array.isArray(body?.workflowConfig) ? body.workflowConfig.slice(0, 50) : [];
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
    const testDataIdentifier = `${testDataPrefix}_customer_${stamp}`;
    if (testingMode !== 'read-only' && !body?.confirmDataChanges) throw new Error('Data-changing test modes require explicit confirmation.');
    if (body?.login?.url) await safeUrl(body.login.url, target.origin);
    const timeout = setTimeout(() => { timedOut = true; browser?.close().catch(() => {}); }, 270_000);
    emit('audit_started', { stage: 'starting', status: 'starting', message: 'Launching isolated browser', details: { testingDepth, dataSafety, testingMode, testDataIdentifier, maxPages } });
    if (testingMode !== 'read-only') emit('warning', {
      stage: 'starting', status: 'warning',
      message: `${testingMode} selected; unconfigured data-changing workflows will be discovered but skipped for safety`
    });
    const executablePath = process.env.VERCEL ? await chromiumPack.executablePath() : undefined;
    browser = await chromium.launch({
      args: process.env.VERCEL ? chromiumPack.args : [], executablePath,
      headless: true
    });
    const context = await browser.newContext({ ignoreHTTPSErrors: false, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(12_000); page.setDefaultNavigationTimeout(25_000);
    const loginResult = await login(page, body.login, target.origin, emit);

    emit('route_discovery_started', { stage: 'discovering_routes', status: 'running', message: 'Discovering authenticated internal routes' });
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
    for (const url of startingUrls) emit('route_discovered', { stage: 'discovering_routes', status: 'waiting', url, message: `Route discovered: ${new URL(url).pathname}` });
    for (const raw of [...requestedUrls, ...discoveredUrls]) {
      const candidate = crawlCandidate(raw, target.origin);
      if (candidate && !queued.has(candidate.href)) {
        queue.push(candidate.href); queued.add(candidate.href);
        emit('route_discovered', { stage: 'discovering_routes', status: 'waiting', url: candidate.href, message: `Route discovered: ${candidate.pathname}` });
      }
    }
    emit('route_discovery_completed', { stage: 'discovering_routes', status: 'passed', totalPages: Math.min(queue.length, maxPages), message: `${Math.min(queue.length, maxPages)} unique routes ready` });
    while (queue.length && pages.length < maxPages) {
      if (cancelled) break;
      const next = queue.shift();
      if (!next || visited.has(next)) continue;
      const safe = await safeUrl(next, target.origin);
      visited.add(safe.href);
      const pageIndex = pages.length + 1;
      const totalPages = Math.min(Math.max(queued.size, pageIndex), maxPages);
      emit('page_started', { stage: 'page_audit', status: 'testing', pageIndex, totalPages, url: safe.href, progress: Math.round(((pageIndex - 1) / totalPages) * 100), message: `Testing page ${pageIndex} of ${totalPages}: ${safe.pathname}` });
      let result;
      try {
        result = await auditPage(page, safe.href, (type, data) => emit(type, { stage: 'page_audit', pageIndex, totalPages, url: safe.href, ...data }), workflowConfig, testDataIdentifier);
      } catch (error) {
        result = {
          url: safe.href, title: safe.pathname, status: null, durationMs: 0, links: [], apiCalls: [], actions: [], features: [], validationIssues: [],
          checks: [{ name: 'Page audit completed', passed: false, detail: error instanceof Error ? error.message : 'Page failed', severity: 'critical' }],
          facts: {}, consoleErrors: [], pageErrors: [error instanceof Error ? error.message : 'Page failed'], failedRequests: []
        };
        emit('error', { stage: 'page_audit', status: 'failed', pageIndex, totalPages, url: safe.href, message: `Page failed: ${result.pageErrors[0]}` });
      }
      pages.push(result);
      for (const link of result.links) {
        const candidate = crawlCandidate(link, target.origin);
        if (candidate) {
          const occurrence = linkOccurrences.get(candidate.href) || { count: 0, pages: new Set() };
          occurrence.count += 1; occurrence.pages.add(result.url); linkOccurrences.set(candidate.href, occurrence);
        }
        if (candidate && !queued.has(candidate.href)) {
          queue.push(candidate.href); queued.add(candidate.href);
          emit('route_discovered', { stage: 'discovering_routes', status: 'waiting', url: candidate.href, totalPages: Math.min(queued.size, maxPages), message: `Route discovered: ${candidate.pathname}` });
        }
      }
      const pageIssues = result.checks.filter(check => !check.passed).length;
      emit('page_completed', {
        stage: 'page_audit', status: pageIssues ? 'issues' : 'passed', pageIndex, totalPages: Math.min(queued.size, maxPages),
        url: result.url, progress: Math.round((pages.length / Math.min(Math.max(queued.size, pages.length), maxPages)) * 100),
        message: pageIssues ? `Page completed with ${pageIssues} issue(s)` : 'Page completed successfully'
      });
    }
    clearTimeout(timeout);
    if (cancelled) return;
    if (timedOut) throw new Error('Audit exceeded the hosted 270-second execution window. Partial results were retained in the event stream.');
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
    const actions = pages.flatMap(item => item.actions || []);
    const report = {
      id: `run-${Date.now()}`, target: target.origin, startedAt: auditStartedAt.toISOString(), completedAt: new Date().toISOString(),
      durationMs: Date.now() - auditStartedAt.getTime(),
      runId, testingDepth, dataSafety, testingMode, testDataPrefix, login: loginResult, pagesScanned: pages.length, passed: checks.filter(item => item.passed).length,
      warnings: checks.filter(item => !item.passed && item.severity === 'warning').length,
      failed: checks.filter(item => !item.passed && item.severity === 'failed').length,
      critical: checks.filter(item => !item.passed && item.severity === 'critical').length,
      featuresDiscovered: pages.reduce((sum, item) => sum + (item.features?.length || 0), 0),
      workflowsFound: actions.filter(action => action.classification !== 'unknown').length,
      workflowsVerified: actions.filter(action => action.tested).length,
      skippedUnsafeWorkflows: actions.filter(action => ['data-changing', 'destructive'].includes(action.classification)).length,
      recordsCreated: 0, recordsUpdated: 0, recordsDeleted: 0, recordsCleaned: 0, cleanupFailures: 0,
      formValidationFailures: pages.reduce((sum, item) => sum + (item.validationIssues?.length || 0), 0),
      permissionFailures: 0, apiFailures: apiIssues.length,
      uiFailures: checks.filter(item => !item.passed && ['failed', 'critical'].includes(item.severity)).length,
      testDataIdentifier, cleanupRegistry: [],
      crudLifecycle: ['Create', 'Verify', 'Search', 'Open', 'Update', 'Verify', 'Delete', 'Verify cleanup'],
      criticalIssues, apiIssues, duplicateUrls, pages
    };
    emit('audit_completed', {
      stage: 'completed', status: report.critical || report.failed ? 'completed_with_issues' : 'completed', progress: 100,
      message: `Audit completed: ${pages.length} page(s) scanned`, report
    });
    response.end();
  } catch (error) {
    emit('audit_failed', { stage: 'failed', status: 'failed', message: error instanceof Error ? error.message : 'Test run failed.' });
    response.end();
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
