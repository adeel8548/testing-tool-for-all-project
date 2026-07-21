# Testing guide

## Architecture

Playwright provides cross-browser E2E, API requests, downloads, reusable sessions, traces, screenshots, video, parallel execution, and an HTML report. Vitest runs fast unit tests for framework and business calculation code. TypeScript strict mode catches unsafe test assumptions before execution.

Coverage is intentionally separated:

- `*.mocked.spec.ts`: fully deterministic browser tests with intercepted responses.
- `*.integrated.spec.ts`: real test-environment API/authentication tests; opt-in.
- Other `*.spec.ts`: true E2E or cross-device checks.

## Folder structure

```text
src/browser/       browser audits and error monitoring
src/config/        environment parsing and safety flags
src/data/          reusable factories and boundary datasets
src/domain/        independently calculated business assertions
src/mocks/         network mocking helpers
src/pages/         small page objects for duplicated workflows
tests/e2e/         executable Playwright suites
tests/templates/   copyable page-test patterns
```

## Setup and commands

Copy `.env.test.example` to `.env.test`, update the target test environment, then run:

```bash
npm install
npm run install:browsers
npm run test:unit
npm run test:e2e:mocked
npm run test:e2e
npm run test:e2e:ui
npm run test:e2e:headed
npm run test:e2e:report
npm run lint
npm run typecheck
npm run build
npm run verify
```

On Windows PowerShell systems that block script wrappers, replace `npm` with `npm.cmd` and `npx` with `npx.cmd`.

## Testing a new page

Copy `tests/templates/page.spec.template.ts` into `tests/e2e`, name it for the feature, and replace the route, heading, and expected controls. Use role, label, placeholder, or visible-text locators. Add `data-testid` only when no stable accessible locator exists. Apply only relevant checklist sections: routing/access, UI, API, form, filters, search, tables, calculations, charts, exports, responsive behavior, accessibility, authorization, and browser quality.

## Fixtures and test data

Factories live in `src/data`. Keep defaults valid and override only fields relevant to a scenario. Use unique `qa-` identifiers for isolated records. Include zero, null, decimal, boundary, long-text, special-character, duplicate, empty, paginated, slow, and failed-response cases.

## Mocking an API

Use `mockJson(page, '**/api/resource**', body, status, delayMs)` before navigation. Assert the request URL or inspect `request.url()` to verify query parameters. Model success, empty, 400, 401, 403, 404, 500, and slow responses. Never mock an entire flow when the test is explicitly classified as integrated or true E2E.

## Authentication

Credentials come only from `.env.test` or CI secrets. Set `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `RUN_INTEGRATED_TESTS=true`, and `RUN_AUTH_TESTS=true`. Use isolated non-production users. For a larger suite, create a Playwright setup project that logs in once and stores state under `auth/`; the directory is gitignored. Add separate storage state per role and never commit it.

## Debugging and reports

Use `npm run test:e2e:ui` for time travel, `npm run test:e2e:debug` for the inspector, or open the HTML report with `npm run test:e2e:report`. Failed runs retain screenshot, video, trace, and attachments in `test-results`. Open a trace with `npx playwright show-trace <trace.zip>`.

## CI

`.github/workflows/test.yml` installs Chromium, runs lint, type checking, unit tests, Playwright tests, and the production TypeScript build. Reports upload even on failure. Add test credentials as repository secrets and opt-in flags as environment variables only for an isolated deployed test environment.

## Adapting to a real application

Inventory all routes and classify public/protected/admin/role-specific/dashboard/form/detail/analytics/settings pages. Document auth storage, APIs, environment variables, state management, validation, data views, exports, permissions, and business-critical journeys. Replace example markup assertions with evidence from the actual implementation; do not change production logic merely to help tests.

## Regional Performance suite

`regional-performance.integrated.spec.ts` is the primary real-application suite. It verifies anonymous denial, Admin access, the real API response, filters, rankings, row calculations, cross-widget consistency, responsiveness, and browser quality. `regional-performance.mocked.spec.ts` intercepts only the page's data endpoint to reproduce stable success data and otherwise hard-to-force loading, empty, and server-error states. Configure the `REGIONAL_*` values in `.env.test` to match the application’s accessible labels and paths.

## Regional Performance suite

The real suite is `tests/e2e/regional-performance.integrated.spec.ts`; it covers Admin access, the actual API response, filters, calculations, rankings, sorting, pagination, cross-widget consistency, browser errors, and layout. Configure the `REGIONAL_*` values in `.env.test` to match the application’s accessible names. The mocked suite intercepts only the regional data endpoint to force slow, empty, and 500 responses and to verify exact ranking boundaries. Mobile and tablet projects execute the responsive suite against the real configured environment.
