/* global document, fetch, Blob, URL, AbortController, TextDecoder, history, location, sessionStorage, confirm, setInterval, clearInterval */
const $ = selector => document.querySelector(selector);
const form = $('#test-form');
const setupScreen = $('#setup-screen');
const auditScreen = $('#audit-screen');
const button = $('#run-button');
const formStatus = $('#form-status');
const activityLog = $('#activity-log');
const routeList = $('#route-list');
const results = $('#results');
const summary = $('#summary');
const pageResults = $('#page-results');
let latestReport; let controller; let startedAt; let durationTimer; let currentRunId;
const events = []; const routes = new Map();
const liveCounts = { passed: 0, warnings: 0, failed: 0 };

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
})[character]);
const value = id => $(`#${id}`).value.trim();
const selected = name => document.querySelector(`input[name="${name}"]:checked`).value;
const formatDuration = milliseconds => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

async function checkWorker() {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' }); const health = await response.json();
    $('#worker-status').textContent = health.workerConfigured ? 'Worker ready' : 'Access key setup required';
    if (health.workerConfigured) $('#worker-status').classList.add('ready');
  } catch { $('#worker-status').textContent = 'Worker unavailable'; }
}

function persistState() {
  if (!currentRunId) return;
  sessionStorage.setItem(`audit:${currentRunId}`, JSON.stringify({ events: events.slice(-500), report: latestReport, startedAt }));
}

function addLog(event) {
  activityLog.querySelector('.empty')?.remove();
  const row = document.createElement('div');
  row.className = `log-entry ${event.status || 'information'}`;
  row.innerHTML = `<span class="log-time">${new Date(event.timestamp).toLocaleTimeString()}</span><span>${escapeHtml(event.message || event.type)}</span>`;
  activityLog.append(row);
  if ($('#auto-scroll').checked) activityLog.scrollTop = activityLog.scrollHeight;
}

function renderRoutes() {
  routeList.innerHTML = routes.size ? [...routes.values()].map(route => `<div class="route-item ${escapeHtml(route.status)}"><span>${route.status === 'passed' ? '✓' : route.status === 'testing' ? '●' : route.status === 'issues' || route.status === 'failed' ? '!' : '○'}</span><span title="${escapeHtml(route.url)}">${escapeHtml(new URL(route.url).pathname || '/')}</span></div>`).join('') : '<p class="empty">Routes will appear here.</p>';
  $('#route-count').textContent = routes.size;
}

function setProgress(event) {
  const progress = Math.min(100, Math.max(0, Number(event.progress) || 0));
  $('#progress-percent').textContent = `${progress}%`; $('#progress-bar').style.width = `${progress}%`;
  $('.progress-track').setAttribute('aria-valuenow', String(progress));
  $('#stage-label').textContent = String(event.stage || 'running').replaceAll('_', ' ');
  $('#audit-status').textContent = String(event.status || event.stage || 'Running').replaceAll('_', ' ');
}

function handleEvent(event, restoring = false) {
  if (!restoring) events.push(event);
  currentRunId = event.runId || currentRunId;
  addLog(event); setProgress(event);
  if (event.type === 'audit_created') {
    startedAt = event.timestamp; $('#audit-start').textContent = new Date(startedAt).toLocaleTimeString();
    $('#audit-domain').textContent = event.target || 'AUDIT'; $('#audit-title').textContent = `Live audit · ${event.runId}`;
    history.replaceState({}, '', `/audit/${event.runId}`);
  }
  if (event.type === 'route_discovered' && event.url) routes.set(event.url, { url: event.url, status: 'waiting' });
  if (event.type === 'page_started' && event.url) {
    routes.set(event.url, { url: event.url, status: 'testing' });
    $('#current-page-title').textContent = `Testing page ${event.pageIndex} of ${event.totalPages}`;
    $('#current-page-url').textContent = event.url; $('#current-check').textContent = 'Loading page';
  }
  if (event.type === 'check_started') $('#current-check').textContent = event.check || event.message;
  if (event.type === 'workflow_discovered') {
    $('#current-workflow').textContent = event.classification || 'unknown';
    $('#current-action').textContent = event.action || event.message;
    $('#test-data-id').textContent = event.testDataIdentifier || 'Not created';
    $('#cleanup-status').textContent = event.cleanupStatus || 'Not required';
  }
  if (event.type === 'check_completed') {
    if (event.status === 'passed') liveCounts.passed += 1;
    else if (event.status === 'warning') liveCounts.warnings += 1;
    else liveCounts.failed += 1;
    $('#live-passed').textContent = liveCounts.passed; $('#live-warnings').textContent = liveCounts.warnings; $('#live-failed').textContent = liveCounts.failed;
    const pagePercent = Math.round(((event.checkIndex || 0) / (event.totalChecks || 1)) * 100);
    $('#page-progress').style.width = `${pagePercent}%`; $('#page-timing').textContent = `${event.checkIndex} of ${event.totalChecks} checks complete`;
  }
  if (event.type === 'page_completed' && event.url) routes.set(event.url, { url: event.url, status: event.status });
  if (event.totalPages) $('#pages-count').textContent = `${event.pageIndex || Math.min(routes.size, event.totalPages)} / ${event.totalPages}`;
  if (event.type === 'audit_completed') {
    latestReport = event.report; renderReport(event.report); finishRun();
  }
  if (event.type === 'audit_failed') { $('#current-check').textContent = event.message; finishRun(); }
  renderRoutes(); if (!restoring) persistState();
}

function finishRun() {
  clearInterval(durationTimer); controller = undefined; $('#stop-audit').disabled = true; button.disabled = false; persistState();
}

function renderReport(report) {
  latestReport = report; results.hidden = false;
  summary.innerHTML = `<div><strong>${report.pagesScanned}</strong><span>Pages scanned</span></div><div><strong class="pass-text">${report.passed}</strong><span>Passed</span></div><div><strong>${report.warnings || 0}</strong><span>Warnings</span></div><div><strong class="fail-text">${report.failed}</strong><span>Failed</span></div><div><strong class="fail-text">${report.critical || 0}</strong><span>Critical</span></div><div><strong>${report.featuresDiscovered || 0}</strong><span>Features</span></div><div><strong>${report.workflowsFound || 0}</strong><span>CRUD workflows</span></div><div><strong>${report.workflowsVerified || 0}</strong><span>Fully verified</span></div><div><strong>${report.recordsCreated || 0}</strong><span>Created</span></div><div><strong>${report.recordsUpdated || 0}</strong><span>Updated</span></div><div><strong>${report.recordsDeleted || 0}</strong><span>Deleted</span></div><div><strong>${report.recordsCleaned || 0}</strong><span>Cleaned</span></div><div><strong class="fail-text">${report.cleanupFailures || 0}</strong><span>Cleanup failures</span></div><div><strong>${report.formValidationFailures || 0}</strong><span>Form issues</span></div><div><strong>${report.permissionFailures || 0}</strong><span>Permission issues</span></div><div><strong>${report.apiFailures || 0}</strong><span>API failures</span></div><div><strong>${report.uiFailures || 0}</strong><span>UI failures</span></div><div><strong>${report.skippedUnsafeWorkflows || 0}</strong><span>Unsafe skipped</span></div>`;
  pageResults.innerHTML = report.pages.map(page => {
    const apiIssues = (page.apiCalls || []).filter(call => !call.ok);
    const skipped = (page.actions || []).filter(action => !action.tested);
    return `<article class="page-result"><div class="page-head"><div><h3>${escapeHtml(page.title || 'Untitled page')}</h3><div class="url">${escapeHtml(page.url)}</div></div><span class="pill ${page.status < 400 ? 'ready' : ''}">HTTP ${escapeHtml(page.status)}</span></div><p><b>Features:</b> ${escapeHtml((page.features || []).join(', ') || 'None detected')}</p><div class="checks">${page.checks.map(check => `<div class="check ${check.passed ? '' : 'fail'}"><span class="mark">${check.passed ? '✓' : '×'}</span><div><b>${escapeHtml(check.name)}</b><small>${escapeHtml(check.detail)}${check.passed ? '' : ` · ${escapeHtml(check.severity)}`}</small></div></div>`).join('')}</div>${(page.validationIssues || []).length ? `<h3>Validation issues</h3>${page.validationIssues.map(issue => `<p>${escapeHtml(issue)}</p>`).join('')}` : ''}${apiIssues.length ? `<h3>API issues</h3>${apiIssues.map(call => `<div class="check fail"><span class="mark">×</span><div><b>${escapeHtml(call.method)} · HTTP ${escapeHtml(call.status)}</b><small>${escapeHtml(call.url)}</small></div></div>`).join('')}` : ''}${skipped.length ? `<details><summary>Skipped or configuration-required workflows (${skipped.length})</summary>${skipped.map(action => `<p><b>${escapeHtml(action.label)}</b> · ${escapeHtml(action.classification)} · ${escapeHtml(action.verification || 'configuration_required')}<br><small>${escapeHtml(action.reason)}</small></p>`).join('')}</details>` : ''}</article>`;
  }).join('');
  if ((report.duplicateUrls || []).length) pageResults.innerHTML += `<article class="page-result"><h3>Duplicate internal links</h3>${report.duplicateUrls.map(item => `<p><b>${escapeHtml(item.occurrences)} occurrences</b><br><small>${escapeHtml(item.url)} · ${escapeHtml(item.foundOn.join(', '))}</small></p>`).join('')}</article>`;
  $('#final-log').innerHTML = events.map(event => `<p><span class="log-time">${new Date(event.timestamp).toLocaleTimeString()}</span> ${escapeHtml(event.message || event.type)}</p>`).join('');
}

async function streamAudit(payload, accessKey) {
  controller = new AbortController();
  const response = await fetch('/api/run-test', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'x-platform-key': accessKey }, body: JSON.stringify(payload) });
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || `Audit request failed (${response.status})`); }
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
  while (true) {
    const { value: chunk, done } = await reader.read(); buffer += decoder.decode(chunk || new Uint8Array(), { stream: !done });
    const lines = buffer.split('\n'); buffer = lines.pop() || '';
    for (const line of lines) if (line.trim()) handleEvent(JSON.parse(line));
    if (done) break;
  }
}

function previewIdentifier() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  $('#test-data-preview').textContent = `${value('test-data-prefix') || 'AUTO_TEST'}_customer_${stamp}`;
}
function updateSafetyWarning() {
  $('#mode-warning').hidden = selected('testingDepth') !== 'full-crud' || selected('dataSafety') === 'read-only';
}
$('#test-data-prefix').addEventListener('input', previewIdentifier);
for (const input of document.querySelectorAll('input[name="testingDepth"],input[name="dataSafety"]')) input.addEventListener('change', updateSafetyWarning);
form.addEventListener('submit', async event => {
  event.preventDefault();
  const testingDepth = selected('testingDepth'); const dataSafety = selected('dataSafety');
  const dataChanging = testingDepth === 'full-crud' && dataSafety !== 'read-only';
  if (dataChanging && !$('#confirm-data').checked) { formStatus.textContent = 'Confirm that this is an authorized test environment.'; formStatus.className = 'error'; return; }
  button.disabled = true; formStatus.textContent = ''; events.length = 0; routes.clear(); Object.assign(liveCounts, { passed: 0, warnings: 0, failed: 0 });
  let workflowConfig = [];
  try { workflowConfig = value('workflow-config') ? JSON.parse(value('workflow-config')) : []; if (!Array.isArray(workflowConfig)) throw new Error('Expected an array'); }
  catch (error) { formStatus.textContent = `Invalid workflow configuration JSON: ${error.message}`; formStatus.className = 'error'; button.disabled = false; return; }
  const payload = { targetUrl: value('target-url'), maxPages: Number(value('max-pages')), testingDepth, dataSafety, testDataPrefix: value('test-data-prefix'), confirmDataChanges: $('#confirm-data').checked, workflowConfig, pageUrls: value('page-paths').split(/[\n,]+/).map(item => item.trim()).filter(Boolean) };
  if (value('login-identifier') || value('password')) payload.login = { url: value('login-url'), identifier: value('login-identifier'), password: value('password'), identifierSelector: value('identifier-selector'), passwordSelector: value('password-selector'), submitSelector: value('submit-selector') };
  setupScreen.hidden = true; auditScreen.hidden = false; $('#stop-audit').disabled = false; startedAt = new Date().toISOString();
  durationTimer = setInterval(() => { $('#audit-duration').textContent = formatDuration(Date.now() - new Date(startedAt).getTime()); }, 1000);
  try {
    await streamAudit(payload, value('access-key'));
    if (currentRunId) history.replaceState({}, '', `/audit/${currentRunId}`);
  } catch (error) {
    if (error.name !== 'AbortError') handleEvent({ runId: currentRunId || 'audit_failed', timestamp: new Date().toISOString(), type: 'audit_failed', stage: 'failed', status: 'failed', message: error.message });
  } finally { $('#password').value = ''; finishRun(); }
});

$('#stop-audit').addEventListener('click', () => {
  if (!controller || !confirm('Stop this active audit? Partial progress will remain visible.')) return;
  controller.abort(); handleEvent({ runId: currentRunId, timestamp: new Date().toISOString(), type: 'audit_cancelled', stage: 'cancelled', status: 'cancelled', message: 'Audit cancelled by user' }); finishRun();
});

$('#download-report').addEventListener('click', () => {
  if (!latestReport) return; const blob = new Blob([JSON.stringify(latestReport, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${latestReport.runId || latestReport.id}.json`; link.click(); URL.revokeObjectURL(link.href);
});

function restoreRun() {
  const match = location.pathname.match(/^\/audit\/([^/]+)$/); if (!match) return;
  const stored = sessionStorage.getItem(`audit:${match[1]}`); if (!stored) return;
  const state = JSON.parse(stored); setupScreen.hidden = true; auditScreen.hidden = false; currentRunId = match[1]; startedAt = state.startedAt;
  for (const event of state.events || []) { events.push(event); handleEvent(event, true); }
  if (state.report) renderReport(state.report); else handleEvent({ runId: currentRunId, timestamp: new Date().toISOString(), type: 'warning', stage: 'disconnected', status: 'warning', message: 'This serverless audit stream ended on refresh; start a new run to continue.' });
}

previewIdentifier(); updateSafetyWarning(); checkWorker(); restoreRun();
