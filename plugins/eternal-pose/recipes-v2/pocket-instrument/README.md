# Pocket Instrument

Pocket Instrument is a compact, readable trip instrument. The home view is a functional rack of readiness and commitment modules; the experience view turns the map into the main display and the itinerary into a channel strip with separate time, place, state, and action zones. A single signal color identifies active or exceptional conditions while labels and rules carry the rest.

## Customization levels

1. **Token customization:** edit `presentation/styles/tokens.css` to change chassis surfaces, rules, signal color, readable type, spacing, and latch timing.
2. **Component customization:** replace the instrument rack, channel strip, status lamps, map display, utility panels, or state views under `presentation/components/`.
3. **Presentation customization:** replace the full `presentation/` tree while keeping the local controller contract and provider boundary.
4. **Full UI replacement:** replace the generated app and presentation with another UI built directly on the pinned headless packages.

There is no npm theme dependency and no runtime theme selector. Generated source is locally owned.

## Map profile and Cloud style guide

`presentation/theme-map-profile.ts` supplies technical, low-density markers and route treatments. Every status lamp has a visible text equivalent; map markers and routes use shape, label, weight, source, certainty, and mode in addition to the signal color. `provider-guides/google-map-style.json` is an optional technical guide for a user-owned Google Cloud map style. Set `VITE_GOOGLE_MAP_ID` to the user's own configured map ID. Without it, the provider fallback remains a real map and the instrument frame stays visible around it.

## Responsive behavior

- `320`, `390`, and `430`: one-hand controls remain 44px, the map display stays primary, and the channel strip opens in an interruptible bottom sheet.
- `768`: the chassis becomes a three-zone workspace with a side rack, map display, and channel sheet.
- `1024` and `1440`: the technical display grows between bounded rails while provider controls and attribution remain clear.
- At 200% text zoom, labels and authored facts wrap in document flow without horizontal overflow.

The instrument uses readable product copy for primary labels and a mono layer only for secondary values. It never creates fake telemetry, a dial, a countdown, or a status communicated by a lamp alone.

## Anti-patterns

Do not turn this into a fake control panel, terminal, cyberpunk console, glowing scanner, or all-caps paragraph wall. Keep the signal color singular and semantic. Preserve native candidate, shopping, reservation, task, location, map, focus, and failure behavior.
