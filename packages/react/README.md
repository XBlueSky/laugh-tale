# @laugh-tale-island/react

Headless React composition for map-first travel sites built on `@laugh-tale-island/core`. The public runtime exports are `TripController` and `useTripExperience`, accompanied by erased TypeScript presentation, model, action, binding, runtime, and controller types. This package contains **no visible components, CSS, icons, design tokens, copy, or fixed page structure**. The consuming site owns every visible element and maps semantic statuses to its own wording.

## Install

```bash
npm install @laugh-tale-island/core @laugh-tale-island/react
```

Peer dependencies are `react >=19.2.0 <20` and `react-dom >=19.2.0 <20`. The package has an exact runtime dependency on the same lockstep version of `@laugh-tale-island/core`. Node.js `>=22.13.0` for building and testing. ESM only. The single documented entry point is `@laugh-tale-island/react`; package-internal hook files are not public subpaths.

In the four-package DAG, React depends only on core. It is a peer of adapters in publication order, not a dependency of adapters; the test-only testing package depends on both plus core.

## Presentation composition

The presentation seam keeps every visible choice in the generated site. `TripController` supplies Home, Experience, progress loading, Setup, Fatal, and navigation through the injected presentation. Every view receives the same actions facade. Experience consumes the package-owned progress, clock, choreography, geolocation, provider lifecycle, and measured layout behavior.

Advanced app composition can use `useTripExperience` with an authored trip, navigation store, progress store, presentation map profile and content factories, and optional runtime adapters. It returns only `model`, `actions`, and `bindings`. Register the map viewport and provide measured sheet geometry through bindings; sheet interaction remains inert until measured. The hook does not create provider substitutes when configuration is absent, and itinerary actions remain usable when a provider is unavailable. Diagnostics go only to the optional developer sink.

`TripPresentationV2` consumes primitive-only DTOs, not authored `Trip` payloads or controller policy. `ExperienceModel.days` preserves each authored ID, ISO date, title and ordinal, including non-contiguous dates. Timeline booking facts are optional; custom nodes expose them only with explicit booking capability. Grouped logistics retain their actual child owner states. Controls must consult their capability records, and presentations own both marker and user-location content factories.

Current/next labels remain scoped to the viewed day. Return-current can navigate to an actual current owner on another authored day (including a cross-midnight interval), while restore-automatic and lodging return remain distinct. A completed current owner is still current; skipped owners are excluded. With no actual current owner, return-current is unavailable rather than choosing a fallback.

Candidate comparison projects the active draft marker separately from committed progress. Confirm/cancel restore full-day framing and the disclosure trigger; switching owners discards the old draft without stealing trigger focus. Map option previews reveal and focus the registered option control without camera echo. Bind option controls with `focus.dialogRef(option.id)`, ordinary interactive owner controls with their owner refs, and preserve the sheet surface ref alongside map-occlusion registration. Automatic/list selection reveals the selected node without moving keyboard focus.

```tsx
import type { Trip } from "@laugh-tale-island/core";
import {
  TripController,
  type ProviderBootstrapState,
  type TripRuntimeAdapters,
} from "@laugh-tale-island/react";
import { createMapAdapter, createNavigationAdapter } from "./provider-adapters.js";
import { presentation } from "./presentation.js";
import { providerReadiness } from "./provider-readiness.js";

const runtime: TripRuntimeAdapters = {
  ...(providerReadiness.map.available
    ? { createMap: () => createMapAdapter() }
    : {}),
  navigation: createNavigationAdapter(),
};

const providerBootstrap: ProviderBootstrapState = providerReadiness.map.available
  ? {}
  : {
      map: {
        status: "unavailable",
        reason: providerReadiness.map.reason,
        retryable: false,
        diagnostic: providerReadiness.map.diagnostic,
      },
    };

export function App({ trip }: { trip: Trip }) {
  return (
    <TripController
      trip={trip}
      presentation={presentation}
      runtime={runtime}
      providerBootstrap={providerBootstrap}
      onDiagnostic={(event) => console.error("trip provider", event)}
    />
  );
}
```

Bootstrap diagnostics go only to the controller and diagnostic sink. The local `presentation` receives typed models, actions, and bindings; it never receives provider failures, diagnostics, causes, adapters, or controller state.

Committed bootstrap failures are diagnosed before their unavailable models are published. Equivalent reason, retryability and diagnostic facts identify the same attempt across rerenders, sink changes and surface switches; changed facts or removal followed by recurrence report again. There is no public attempt ID to distinguish an identical replacement from an inline object. Bootstrap retryability remains a provider fact, but retry controls are exposed only when this controller owns an executable retry.

## Internal behavior

Selection, progress persistence, route loading, user location, candidate decisions, and sheet interaction are composed internally. Their individual hooks and controller types are package-private implementation seams, with no root exports or public deep-import paths. Use the v2 presentation composition above to consume this behavior.

## Prop-getter contract

Prop-getters compose your event handlers instead of replacing them: your handler runs first, and calling `event.preventDefault()` cancels the package's default action for that event. Keep the returned ARIA state and keyboard behavior wired to your own elements and labels.

## Failure semantics and privacy

Hooks return semantic statuses (`"denied"`, `"unavailable"`, `"memory-only"`, …), never display strings. Provider diagnostics remain structured non-display evidence for logging or site-owned translation. Missing browser capabilities produce explicit states rather than fabricated success. No runtime place search, bundled itinerary data, or credential discovery occurs here, and live location never enters progress storage.

## Experience contract

Extracted from and verified against the Eternal Pose React starter. The map-first experience contract lives at
[`plugins/eternal-pose/starter/react/docs/trip-experience-contract.md`](../../plugins/eternal-pose/starter/react/docs/trip-experience-contract.md).

## License

MIT. Laugh Tale is an unofficial fan homage; see the repository [NOTICE](../../NOTICE.md) for the non-affiliation statement.
