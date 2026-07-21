# Testing plan

## Scope

The repository started empty, so this project provides application-independent infrastructure rather than claiming coverage of an unknown product. When a target is configured, analysis begins with its routes, authentication, API contracts, roles, state, forms, tables, exports, loading/error/empty states, and responsive behavior.

## Layers

1. Unit: calculations, validators, factories, and configuration.
2. Fully mocked browser: deterministic UI, API response, edge-state, and accessibility checks.
3. API-integrated: read-only test-environment contract and response checks.
4. True E2E: isolated test-user workflows and explicitly enabled mutations.

## Initial risk priorities

Authentication and authorization; critical route availability; calculation correctness; filters and API query consistency; form validation and duplicate submission; table pagination; export/download behavior; errors and empty states; console/network quality; accessibility; responsive overflow.

## Safety

No production credentials, implicit mutations, hardcoded secrets, arbitrary waits, or unstable style selectors. Mutation tests require `ALLOW_TEST_MUTATIONS=true` and should use uniquely prefixed disposable records.
