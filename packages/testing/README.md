# @laugh-tale-island/testing

Deterministic v2 test doubles, synthetic fixtures, environment-neutral setups, and reusable provider conformance contracts for Laugh Tale applications and adapters.

This package is test-only. Production packages must not import it.

Install it with the three runtime packages and its external peers. The single public entry is `@laugh-tale-island/testing`; its conformance runners execute in Vitest, which is a required peer. Every exported fake exposes the literal readonly marker `testOnly = true`, so test wiring can distinguish deterministic doubles from production adapters. Compiled synthetic fixtures under the package artifact are intentional public test data; source files and package-internal fixture paths are not public subpaths.

The four-package dependency DAG is `core` → (`react`, `adapters`) → `testing`: React and adapters each depend only on core and do not depend on each other; testing depends on all three. All internal edges use the exact shared release version.

## Provider-neutral contract controls

The route and place contract runners receive a factory that returns an adapter plus a provider-neutral control harness. The control exposes provider-start/completion counts, an explicit per-call completion barrier, and deterministic fixture-specific ready, malformed, rejected, and synchronous-start-failure settlement without prescribing an SDK, transport, provider identifier, response payload, or diagnostic text. `beginReadyWithHeldWork` begins a ready result while retaining provider-owned work, `heldWorkReachedReleasePoint` proves that work reached its deterministic release point, and `releaseHeldWork` permits it to settle. `completed` must remain pending until the provider operation has fully settled and a later task has run after adapter continuation and cache/in-flight cleanup. The contract independently schedules that post-release task and rejects an earlier completion signal. Each harness also supplies its own valid request builder, unsupported request, and fixture-specific normalized ready values so abandoned, replacement, and cross-owner results cannot alias. Provider-specific mechanics and their mapping to the held-work protocol stay private inside each conformance invocation.

The map runner keeps its five-argument signature. Its `createHost` callback must attach a `MapAdapterV2ContractBridge` at `Symbol.for("@laugh-tale-island/testing/map-adapter-v2-contract-bridge")`. The bridge is a test-host protocol: it records exact map/placement/route semantic mutations and disposal, callback activation, update-before-provider ordering, provider-normalized camera calls, owned idle completion, zoom writes, and the adapter's exact supported unavailable value. `routeOwner` supplies only the stable semantic edge identity needed to correlate a provider route operation; the runtime must reconstruct normalized geometry, paint, clickability, and map association from the actual provider constructor/update payload. This lets any provider runtime implement the same tests without network access or provider-specific DOM events and prevents an input-side expected-value ledger from satisfying provider-output assertions. A fit call records exact flattened bounds and all four insets; the contract requires exactly two provider arguments for the immediate fit path and does not prescribe an animation-duration argument.

## Build and test

```bash
npm run build --workspace @laugh-tale-island/testing
npm test --workspace @laugh-tale-island/testing
```
