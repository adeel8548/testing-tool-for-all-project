# Live Audit Architecture

## Request and event flow

1. The browser validates the target, testing mode, and explicit mutation confirmation.
2. `POST /api/run-test` validates the platform key and target against SSRF rules.
3. The function creates a `runId` and streams newline-delimited JSON events from actual Playwright work.
4. The browser switches to `/audit/{runId}`, consumes the response stream, and updates the progress, route, current-check, log, and result panels.
5. Authentication remains inside one isolated browser context so its cookies and storage are reused across discovered pages.
6. Route discovery normalizes same-origin URLs and excludes logout, destructive, external, and download routes.
7. Each page publishes start, check, API, route, completion, and failure evidence.
8. The terminal event contains the final report; the received event history remains available in **Audit execution log**.

## Testing modes

- **Read-only audit** is the default. It performs navigation and passive UI, API, accessibility, HTTP, and workflow discovery.
- **Safe CRUD testing** and **Full staging test** require explicit authorization. The generic runner classifies data-changing actions but skips any workflow that has no configured test-data and cleanup contract.
- The generic runner never blindly clicks delete, submit, payment, notification, or other data-changing controls.

Workflow-specific authorization can be supplied from the UI as JSON:

```json
[
  {
    "page": "/users",
    "action": "Add user",
    "allowed": true,
    "testData": { "name": "AUTO_TEST" },
    "expectedOutcome": "User appears in list",
    "cleanup": { "method": "DELETE", "url": "/api/users/{id}" }
  }
]
```

Supplying this contract changes the workflow from `configuration_required` to `configuration_ready`. Execution still requires an application-specific adapter that understands the entity identifier and can prove cleanup; the generic runner does not guess those semantics.

## Environment

Set `PLATFORM_ACCESS_KEY` in the hosted environment. The browser sends it as `x-platform-key`. Use an isolated target-application account when authentication is required.

```powershell
npm install
npm.cmd run install:browsers
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:unit
npx.cmd playwright test --project=mocked
npm.cmd run build
```

## Security

- Passwords are consumed only by the active request and are never included in events or reports.
- Sensitive API query parameters are redacted.
- Hosted scans reject localhost, private hostnames, private IP results, embedded URL credentials, and cross-origin login URLs.
- Logout, destructive URL patterns, external origins, and common file downloads are excluded from crawling.

## Current limitations

- The Vercel implementation streams one active request. Completed state and received events can be restored from `sessionStorage`, but an active audit cannot reliably reconnect after refresh or migrate between serverless instances without durable shared storage and a background job service.
- CRUD execution needs an application-specific workflow definition: valid test data, expected results, allowed actions, record identifiers, and cleanup endpoints. Unconfigured actions are reported as `configuration_required` instead of being executed unsafely.
- Links hidden behind semantically marked menus are discovered. A custom control that exposes no URL in the DOM needs an explicit path in **Additional page paths**.
- The hosted function has a 270-second internal safety deadline inside Vercel's 300-second maximum duration.
