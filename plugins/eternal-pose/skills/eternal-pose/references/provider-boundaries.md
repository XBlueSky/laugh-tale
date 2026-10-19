# Provider Boundaries

Keep trip core and ordinary renderers independent of any provider SDK.

## Neutral interfaces

- Define `MapAdapter` around serializable marker, candidate, route, fit, focus, padding, user-location, and cleanup operations.
- Define `RouteAdapter` from a provider-neutral edge request to a normalized path, summary, and explicit success/failure status.
- Define `PlaceAdapter` from a provider ID or authorized text query to normalized place facts with source metadata.
- Define `NavigationAdapter` to create a consumer navigation URL from application data.
- Keep SDK classes, DOM nodes, provider event objects, and undocumented provider state out of trip core, persisted content, and renderer contracts.

## v2 capability matrix

| Capability | v2 status | Boundary |
| --- | --- | --- |
| Google Maps JavaScript API | Required for the real primary map | Show missing configuration honestly; never fake readiness. |
| Google Routes API | Optional | Support walking, driving, and transit where available; retain manual summaries and navigation on failure. |
| Places API (New) | Optional | Resolve places or selected facts only with clear authorization and provenance. |
| Google Maps consumer URLs | Always available | Use for external origin/destination/mode navigation without an API key. |
| Browser Geolocation | Optional and user initiated | Do not persist or add a user's location to trip content. |

Do not add Geocoding, Roads, or another API merely because it is enabled. Provider-neutral interfaces preserve future options; do not claim unimplemented provider support.

## Separate browser and server configuration

`VITE_GOOGLE_MAPS_API_KEY` is the referrer-restricted browser Maps key. `ETERNAL_POSE_GOOGLE_PLACES_API_KEY` is the server credential read by `enrich-trip-project.mjs search`; never prefix it with `VITE_`, copy it to client code, print it, or place it in trip input. Server search requires explicit authorization/configuration and installed packages. Without that configuration, preserve unresolved owners and report the unavailable observation.

Follow the exact search/review/selection/accept commands in `workflow.md`. Search produces a separate review artifact; human selections bind to its canonical hash. `enrich-trip-project.mjs accept` alone changes the accepted ledger and matching manifest provenance hash. A successful fake-adapter suite, candidate archive attestation, or runtime candidate click is not a live provider observation or accepted ledger.

## Data minimization and credentials

- Request only fields needed for the current user-visible result. Use minimal field masks, bounded concurrency, appropriate session caching, and narrow request scope.
- Distinguish user-supplied facts, provider-returned facts, cached responses, and agent inference.
- Do not persist volatile opening status, route schedules, or broad provider responses as permanent trip truth.
- Keep local keys in ignored environment files. Put only variable names and setup guidance in an example environment file.
- Restrict browser keys by HTTP referrer and API allowlist; establish quota and billing alerts before deployment.
- Never expose server credentials or treat a client key as secret after it is delivered to a browser.

## External navigation

- Build a valid HTTPS Google Maps consumer URL from normalized origin, destination, and travel mode.
- Preserve a user-authored manual route summary beside the external link when a live route is missing.
- Avoid embedding precise live transit departures as timeless site data.

## Failure states

- Allow a production build without a local key, but fail deploy readiness when the required real-map configuration is absent.
- Keep list content, markers that remain available, other routes, and external navigation working when one route fails.
- Keep user content when place resolution fails; never invent coordinates, place IDs, hours, or “open now” state.
- Report unresolved places and unavailable features explicitly. Do not draw synthetic polylines or call an unconfigured surface a map.
- Guard geolocation callbacks with mounted/generation state so unmount, repeated watches, and stale callbacks cannot move the current map.
