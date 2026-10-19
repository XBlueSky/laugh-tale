---
status: accepted
date: 2026-09-02
---

# Google-only provider behind a neutral adapters package

The neutral interfaces (`MapAdapter`, `RouteAdapter`, `PlaceAdapter`, `NavigationAdapter`) stay in `core/browser`. Implementations live in `@laugh-tale-island/adapters` with one subpath per provider, `adapters/google` first; each provider's SDK is an optional peer dependency pulled only by its subpath. 2.0 ships Google only.

One provider done to the benchmark's level beats two done adequately, and part of the benchmark's craft (AdvancedMarker, Routes API transit details) is Google-specific. The subpath layout keeps a second provider such as MapLibre a non-breaking addition, keeps `react` independent of any map SDK, and adds one pin rather than one release line per provider.

## Considered options

- `@laugh-tale-island/google`. Rejected: binds the provider into the package name.
- One package per provider (`adapter-google`, `adapter-maplibre`). Rejected: a release line per provider.
- `@laugh-tale-island/map`. Rejected: routes and places are not the map.
