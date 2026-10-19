---
status: accepted
date: 2026-10-01
---

# Optional keyless map behind the neutral map interface

The owner approved a MapLibre + OpenStreetMap option to unblock Oak & Washi visual work without Google billing. This supersedes only ADR-0004's Google-only delivery restriction. Its four-package release train, optional-peer/subpath architecture and neutral core/react boundary remain intact.

`@laugh-tale-island/adapters/maplibre` owns SDK mechanics and translates the existing neutral visual profile. The recipe owns marker/location content; the generated site owns provider selection and local worker/CSS bundling. `VITE_MAP_PROVIDER=maplibre` explicitly selects the keyless path; omitted configuration retains Google. Free mode must not initialize paid Google services even when old flags remain set.

The additive optional `MapAdapterV2.setLayout` delivers committed layout independently of camera intent. This is necessary for unobscured attribution when unresolved places produce no camera geometry. It introduces no Trip schema or provider-specific choreography.

Pin SDK 6.10.0 and validate the official Shortbread v1 metadata. Use local system-font glyph generation, no remote styles/glyph server. Public OSM tiles are a modest interactive preview service, not an unlimited free production guarantee. Automated tests use local synthetic tiles only.

This option displays maps, not Places/Routes/opening-hours parity. It does not resolve the synthetic example's fictional places or establish that its coordinates identify real venues; composition conservatively rejects provider-tagged coordinates and provider routes. Explicit user navigation links remain separate from map display. Existing data, visual sign-off, native-device and release gates are unchanged.
