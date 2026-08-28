# @laugh-tale-island/react

React hooks and prop-getters for map-first travel sites built on `@laugh-tale-island/core`. Behavior only — this package contains **no components, CSS, icons, design tokens, copy, or fixed page structure**. The consuming site owns every visible element and maps semantic statuses to its own wording.

## Install

```bash
npm install @laugh-tale-island/core @laugh-tale-island/react
```

Peer dependencies: `react >=19.2.0 <20` and `@laugh-tale-island/core 0.1.0` (the exact core version this release is tested against). Node.js `>=22.13.0` for building and testing. ESM only. The single documented entry point is `@laugh-tale-island/react`.

## Hooks

- `useTripSelection` — automatic/current vs. manual selection ownership with return-to-now.
- `useTripProgress` — strict progress hydration, pending-write sequencing, cross-tab updates, and trip-scoped actions through an injected `ProgressStore` (see `@laugh-tale-island/core/browser`); a refused write downgrades to the semantic `"memory-only"` status without losing in-session progress.
- `useRouteStates` — per-owner route loading, cancellation, stale-request protection, normalized results, and retry; adapter failures surface provider data, with site-injected fallback wording via `adapterErrorReason`.
- `useUserLocation` — explicit watch lifecycle, one-time first focus, recenter, denial and unavailability statuses, stale-callback protection.
- `useCandidateDecision` / `useOptionalCandidateDecision` — committed choice stays with the caller's progress; draft preview, confirm, cancel, reopen, session-scoped map overrides, and trigger focus restoration live here. The optional form stays mounted while a selected candidate group appears, changes, or disappears.
- `useItinerarySheet` — collapsed/half/expanded controlled snaps, interruptible pointer-captured dragging, velocity/distance snapping, keyboard stepping, and reduced-motion transition suppression via `getSheetProps()` / `getHandleProps()`.

## Prop-getter contract

Prop-getters compose your event handlers instead of replacing them: your handler runs first, and calling `event.preventDefault()` cancels the package's default action for that event. Keep the returned ARIA state and keyboard behavior wired to your own elements and labels.

## Failure semantics and privacy

Hooks return semantic statuses (`"denied"`, `"unavailable"`, `"memory-only"`, …), never display strings. Missing browser capabilities produce explicit states rather than fabricated success. No network access, no bundled itinerary data, and live location never enters progress storage.

## Experience contract

Extracted from and verified against the Eternal Pose React starter. The map-first experience contract lives at
[`plugins/eternal-pose/starter/react/docs/trip-experience-contract.md`](../../plugins/eternal-pose/starter/react/docs/trip-experience-contract.md).

## License

MIT. Laugh Tale is an unofficial fan homage; see the repository [NOTICE](../../NOTICE.md) for the non-affiliation statement.
