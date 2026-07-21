export type TestEnvironment = {
  baseUrl: string;
  apiBaseUrl: string;
  loginPath: string;
  protectedPath: string;
  runIntegratedTests: boolean;
  runAuthTests: boolean;
  allowMutations: boolean;
};

const truthy = new Set(['1', 'true', 'yes', 'on']);
const flag = (value: string | undefined): boolean => truthy.has(value?.toLowerCase() ?? '');

export function readEnvironment(source: NodeJS.ProcessEnv = process.env): TestEnvironment {
  const baseUrl = source.BASE_URL ?? 'http://127.0.0.1:3000';
  return {
    baseUrl,
    apiBaseUrl: source.API_BASE_URL ?? `${baseUrl.replace(/\/$/, '')}/api`,
    loginPath: source.LOGIN_PATH ?? '/login',
    protectedPath: source.PROTECTED_PATH ?? '/dashboard',
    runIntegratedTests: flag(source.RUN_INTEGRATED_TESTS),
    runAuthTests: flag(source.RUN_AUTH_TESTS),
    allowMutations: flag(source.ALLOW_TEST_MUTATIONS)
  };
}

export function requireCredential(name: 'TEST_USER_EMAIL' | 'TEST_USER_PASSWORD'): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for authentication tests`);
  return value;
}
