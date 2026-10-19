# @laugh-tale-island/adapters

Google Maps route, place, navigation, Node place-search, and optional keyless MapLibre map adapters for `@laugh-tale-island/core`.

Use `@laugh-tale-island/adapters/google` in browser-capable applications and `@laugh-tale-island/adapters/google/node` for server-side place search.

## Install and entry points

```bash
npm install @laugh-tale-island/core @laugh-tale-island/adapters
```

- `@laugh-tale-island/adapters/google` exports browser map, route, place, and navigation mechanics plus explicit Google Maps configuration helpers.
- `@laugh-tale-island/adapters/google/node` exports `GooglePlaceSearchAdapter` for controlled server/build-time enrichment.
- `@laugh-tale-island/adapters/maplibre` exports `MapLibreMapAdapter` and its options type. Install `maplibre-gl@6.10.0` when selecting it; neither other subpath requires this optional SDK.

There is no provider-ambiguous package root and no other public subpath. Google browser configuration receives a browser-restricted Maps JavaScript key explicitly. Server place search receives a separate server credential and injected fetch implementation explicitly; adapters never read environment variables, inspect the browser for keys, or search for credentials at runtime. Keep server credentials out of browser bundles.

## Keyless MapLibre map

The MapLibre subpath implements the same `MapAdapterV2` contract, including the optional `setLayout` notification. Supply committed layout even when no place has coordinates, so visible attribution stays outside itinerary/header occlusions. The adapter owns a nested full-size surface; the caller owns host positioning and dimensions.

Bundle the SDK CSS and worker locally. For Vite:

```ts
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { MapLibreMapAdapter } from "@laugh-tale-island/adapters/maplibre";

setWorkerUrl(workerUrl);
const map = new MapLibreMapAdapter();
```

The default source is OSM's public Shortbread v1 vector service, intended for modest interactive use, not guaranteed production capacity or bulk/offline downloads. Keep attribution, normal Referer and caching. An alternative `tileJSONUrl` must serve the required Shortbread layers over HTTPS with same-origin tile templates. Loopback HTTP requires explicit `allowLocalhostHTTP: true`. WebGL2 is required; system fonts draw labels locally, without a remote glyph or sprite service. Optional `initialView` configures a viewing center, not a resolved trip place.

This is a basemap/marker/static-route renderer, not a search, geocoding or live routing service. Check coordinate and route provenance before using another provider's data. The starter supplies that compatibility gate and explicit provider selection; the adapter never initializes Google or chooses a fallback automatically.

In the four-package DAG, adapters depends only on the exact lockstep core version. It is a peer of React in publication order, not a dependency of React; the test-only testing package depends on both plus core.

Provider failures become structured unavailable results with stable reasons, retryability, and optional raw diagnostics. Diagnostics are evidence for logs and debugging, not display copy. Place search is an explicit enrichment operation; the runtime map experience does not silently search for or replace unresolved authored places.

## Google map style and placement

The default configuration supplies only the browser key and development flag. With no Map ID, the adapter explicitly uses a raster map and translates the mounted visual profile's palette and guidance into inline styles. This is the zero-extra-theme-setup path.

An advanced configuration must supply both `mapId` and `cloudStyleProfileId` in `GoogleMapsConfigInput` (or `GoogleMapAdapterOptions` when constructing directly). Both strings are trimmed. Nonblank values must occur as a pair; malformed or incomplete pairs are refused before map construction. Blank absent values select the default path. A missing API key still reports missing configuration.

Before using a Map ID, the operator must publish the compatible cloud style and associate it with that ID in Google Cloud. At mount, the declared `cloudStyleProfileId` must equal `config.visualProfile.id`. Map-ID mode uses that cloud style and sends no unsupported inline styles or StyledMapType workaround. Pair equality is an operator precondition: this library cannot inspect the cloud style's actual colors, publication state, or association. It cannot establish visual equivalence through option-object tests.

Phase 04 owns the canonical matching Oak & Washi cloud preset; Phase 05 owns generated setup instructions and copying. That preset does not ship in Phase 01. Their acceptance includes real-provider style verification in both modes; choosing a Map ID does not waive final palette/marker parity.

Both modes disable default provider controls while preserving Google attribution/legal chrome and normal map gestures. With a valid pair, AdvancedMarkerElement places the exact recipe element at an explicit bottom-center anchor. The no-ID OverlayView places the same element inside one unbranded positioning wrapper with the same bottom-center anchor. Translation and stacking belong to the wrapper; recipe scaling/rotation remain untouched. Marker priority is selected → numbered candidate → numbered primary → base. Advanced Markers translate that order to collision behavior and zIndex; overlays use stacking order without claiming equivalent collision culling. Native controls keep native keyboard activation; custom controls receive one cancelled Enter/Space activation.

## Camera and failure observability

Immediate fit, focus, and recenter use the documented map projection, the core-supplied viewport/insets and zoom constraints, then a single non-animated `moveCamera`. Projection readiness uses `projection_changed`; superseded/remounted/destroyed operations cannot apply later. Translation resets heading/tilt to zero for the north-up projection. Animated fit uses `fitBounds` and an owned idle zoom clamp; animated focus/recenter uses provider pans. Semantic selection, usable-region choice, and zoom policy remain in core.

The loader runtime bridges Google's documented global `gm_authFailure` callback to subscribers. It shares callback ownership across mounted maps, preserves a previous global owner, and removes/restores only its own callback on final teardown. Authentication failure reports nonretryable `request-denied` once per current mount generation. Injected runtimes may provide their own `subscribeFailures`; there is no invented instance Map error event. Google offers no general observable terminal-map error event: tile, network, renderer, or externally replaced callback failures without a documented signal cannot be inferred by this adapter. Synchronous method throws remain catchable by the lifecycle. Tests use injected provider mechanics and real DOM interaction simulation; no live Google/cloud style verification is claimed here.

Places details requests carry the explicit locale as `languageCode`; shared work and cache identity include both reviewed place ID and effective language. Malformed supplied route distances fail normalization before core route quarantine.

References: [Map methods and style restrictions](https://developers.google.com/maps/documentation/javascript/reference/map), [authentication callback](https://developers.google.com/maps/documentation/javascript/events#auth-errors), [Advanced Marker anchors and collision](https://developers.google.com/maps/documentation/javascript/reference/advanced-markers), [Places details language](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/get).

## Build and test

Run the package build before its tests:

```bash
npm run build --workspace @laugh-tale-island/adapters
npm test --workspace @laugh-tale-island/adapters
```

The adapters build automatically prebuilds the current core workspace. The test suite then verifies that both declared Google subpaths were emitted and that no provider-ambiguous root or copied core tree exists in `dist`.
