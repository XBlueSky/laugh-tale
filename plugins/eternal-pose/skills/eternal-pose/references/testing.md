# Testing

Use fresh evidence before any completion, readiness, or compliance claim.

## RED to GREEN

- Add or identify a test that fails for the missing behavior before implementation.
- Run it and confirm the failure is caused by the missing behavior, not a test error.
- Implement the smallest coherent change, run the focused test to GREEN, then run the relevant full gates.
- For a regression, verify the test fails without the fix and passes with it.
- Keep fixtures deterministic and assert user-observable contracts rather than provider internals or mutable starter structure.

## Generated-site gates

Use the exact `validate-trip-project.mjs` then `verify-trip-project.mjs` invocations in `workflow.md`. Install first with `npm ci` for registry projects; contributor staging installs its attested candidate itself. Verify runs unit, type-check, lint, generated experience, accessibility, and build commands in the project using installed dependencies, redirects output/cache/environment to owned temporary directories, and verifies unchanged source identity. Validate scans authored/build content and checks manifest/input/ledger/package/lock identity; it does not prove live Google readiness. Never delete artifacts or weaken scanner rules to obtain a passing result.

Run generated `npm run check`, `npm run test:experience`, `npm run test:a11y`, and `npm run test:e2e` for their respective coverage. Browser tests use explicitly synthetic test fixtures; their success is not proof that an unreviewed real Trip has accepted places. Null-content Setup can render correctly while trip-readiness remains incomplete. Root contributor checks, candidate checks, provider observations, native-device checks, and visual review are separate evidence.

Verify checks the installed `node_modules` directory, the four owned package names/pinned versions, and contained `vitest`, `tsc`, `eslint`, and `vite` executables before each command. Ordinary npm `.bin` symlinks to contained files are supported. Missing installs or changed/escaping checked dependencies refuse execution. Static Validate does not certify an installed tree, and these checks do not sandbox arbitrary custom scripts or certify every transitive third-party link.

Run the generated repository's canonical equivalents of:

1. Trip-content validation and unit tests.
2. TypeScript type-check.
3. Lint.
4. Production build.
5. `git diff --check`.
6. Playwright browser tests with deterministic fake map, route, and place adapters.

Do not claim ready when a required command failed, was skipped, or covered only part of the changed surface. Record the command, exit status, failure count, and any intentionally unavailable gate.

## Core deterministic coverage

- Exercise all eight built-in types and at least one custom type with declared capabilities.
- Exercise fixed, suggested, candidate, and unverified timing; candidate preview/confirm/reopen; tasks; reservations; shopping progress; lodging returns; and day reset.
- Exercise independent route ownership, walking collapse at five minutes or less, filter-driven recomposition, and stale-data clearing.
- Exercise strict progress parsing, malformed payload rejection, trip-key isolation, StrictMode hydration replay, storage failure, and in-memory fallback.
- Use fake provider adapters in ordinary CI. Do not assert against Google private DOM or spend real API quota.

## Browser and accessibility matrix

Run Playwright at 320, 390, and 430 CSS-pixel widths with suitable standard and short heights. Cover:

- map/list bidirectional selection and map padding;
- collapsed, half, and expanded sheet states, interrupted drag, rotation, safe areas, and return-to-map action;
- day switching, cross-midnight timing, and live current/next behavior;
- unique route connector ownership, transit expansion, failure fallback, and external navigation;
- expanded candidate comparison and selected-only collapsed state;
- representative lodging, dining, shopping, experience, logistics, transfer, transport, sightseeing, and task flows;
- progress reload/reset and geolocation success, denied, unavailable, and stale-callback cases;
- keyboard operation, focus restoration, dialogs, visible focus, touch targets, contrast, forced colors, and reduced motion.

## Real Google smoke policy

- Run a real-Google smoke test only in a local or controlled deployment with correct user-provided configuration and explicit permission to use the API.
- Keep it outside required pull-request CI and avoid recording keys, provider responses, or personal location.
- Verify the real map initializes, one supported route resolves or fails truthfully, a place request uses minimal fields, and external navigation remains available.
- Record an unavailable or declined smoke test as such; never replace it with a fake-readiness claim.
