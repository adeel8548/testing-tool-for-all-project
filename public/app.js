/* global document, fetch, Blob, URL */
const form = document.querySelector('#test-form');
const status = document.querySelector('#form-status');
const button = document.querySelector('#run-button');
const results = document.querySelector('#results');
const summary = document.querySelector('#summary');
const pageResults = document.querySelector('#page-results');
const workerStatus = document.querySelector('#worker-status');
let latestReport;

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
})[character]);

async function checkWorker() {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' }); const health = await response.json();
    workerStatus.textContent = health.workerConfigured ? 'Worker ready' : 'Access key setup required';
    if (health.workerConfigured) workerStatus.classList.add('ready');
  } catch { workerStatus.textContent = 'Worker unavailable'; }
}

function renderReport(report) {
  latestReport = report; results.hidden = false;
  summary.innerHTML = `<div><strong>${report.pagesScanned}</strong><span>Pages scanned</span></div><div><strong class="pass-text">${report.passed}</strong><span>Passed</span></div><div><strong>${report.warnings ?? 0}</strong><span>Warnings</span></div><div><strong class="fail-text">${report.failed}</strong><span>Failed</span></div><div><strong class="fail-text">${report.critical ?? 0}</strong><span>Critical</span></div>`;
  pageResults.innerHTML = report.pages.map(page => `<article class="page-result"><div class="page-head"><div><h3>${escapeHtml(page.title || 'Untitled page')}</h3><div class="url" title="${escapeHtml(page.url)}">${escapeHtml(page.url)}</div></div><span class="pill ${page.status < 400 ? 'ready' : ''}">HTTP ${escapeHtml(page.status)}</span></div><div class="checks">${page.checks.map(check => `<div class="check ${check.passed ? '' : 'fail'}"><span class="mark">${check.passed ? '✓' : '×'}</span><div><b>${escapeHtml(check.name)}</b><small>${escapeHtml(check.detail)}</small></div></div>`).join('')}</div></article>`).join('');
  results.scrollIntoView({ behavior: 'smooth' });
}

form.addEventListener('submit', async event => {
  event.preventDefault(); button.disabled = true; results.hidden = true; status.className = '';
  status.textContent = 'Starting isolated browser… this can take up to a few minutes.';
  const value = id => document.querySelector(`#${id}`).value.trim();
  const pageUrls = value('page-paths').split(/[\n,]+/).map(item => item.trim()).filter(Boolean);
  const payload = { targetUrl: value('target-url'), maxPages: Number(value('max-pages')), pageUrls };
  if (value('login-identifier') || value('password')) payload.login = {
    url: value('login-url'), identifier: value('login-identifier'), password: value('password'),
    identifierSelector: value('identifier-selector'), passwordSelector: value('password-selector'), submitSelector: value('submit-selector')
  };
  try {
    const response = await fetch('/api/run-test', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-platform-key': value('access-key') }, body: JSON.stringify(payload) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'The test run failed.');
    status.textContent = `Completed ${data.pagesScanned} page audit.`; renderReport(data);
  } catch (error) { status.textContent = error.message; status.className = 'error'; }
  finally { button.disabled = false; document.querySelector('#password').value = ''; }
});

document.querySelector('#download-report').addEventListener('click', () => {
  if (!latestReport) return; const blob = new Blob([JSON.stringify(latestReport, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${latestReport.id}.json`; link.click(); URL.revokeObjectURL(link.href);
});

checkWorker();
