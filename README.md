# Testing Tool for All

A reusable, safe-by-default web and API testing framework built with TypeScript, Playwright, and Vitest.

```bash
copy .env.test.example .env.test
npm install
npm run install:browsers
npm run verify
```

Open the interactive Playwright test dashboard with `npm run dev`.

Mocked tests run without an application server. Real API and authentication tests are explicitly opt-in. See [TESTING_GUIDE.md](TESTING_GUIDE.md).
