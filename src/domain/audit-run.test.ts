import { describe, expect, it } from 'vitest';
import { normalizeAuditUrl, redactAuditValue, requiresWorkflowConfiguration } from './audit-run.js';

describe('audit run safety helpers', () => {
  it('normalizes hashes and trailing slashes', () => {
    expect(normalizeAuditUrl('/dashboard/#chart', 'https://example.com')).toBe('https://example.com/dashboard');
  });

  it('rejects external and logout routes', () => {
    expect(normalizeAuditUrl('https://outside.example/path', 'https://example.com')).toBeNull();
    expect(normalizeAuditUrl('/logout', 'https://example.com')).toBeNull();
  });

  it('classifies data-changing actions as requiring configuration', () => {
    expect(requiresWorkflowConfiguration('Delete user')).toBe(true);
    expect(requiresWorkflowConfiguration('Search users')).toBe(false);
  });

  it('redacts credentials and tokens', () => {
    expect(redactAuditValue('password', 'unsafe')).toBe('[REDACTED]');
    expect(redactAuditValue('authorization', 'Bearer unsafe')).toBe('[REDACTED]');
    expect(redactAuditValue('status', 'passed')).toBe('passed');
  });
});
