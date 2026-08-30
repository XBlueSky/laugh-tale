# Live Journey

Live Journey is a quiet now-and-next board for a trip in motion. It gives the nearest actionable fact the strongest hierarchy, keeps the real map persistent, and lets completed history recede without losing its place in the day. Its visual language is a neutral operational canvas, a strong time rail, route state bands, and a single replaceable signal accent.

## Customization levels

1. **Token customization:** edit `presentation/styles/tokens.css` to change the canvas, rules, signal color, spacing, readable type scale, and state timing.
2. **Component customization:** replace the now/next board, live timeline, disruption panel, map framing, utility dialogs, or state views under `presentation/components/`.
3. **Presentation customization:** replace the full `presentation/` tree while keeping the local controller contract and provider boundary.
4. **Full UI replacement:** replace the generated app and presentation with another UI built directly on the pinned headless packages.

There is no npm theme dependency and no runtime theme selector. Generated source is locally owned.

## Map profile and Cloud style guide

`presentation/theme-map-profile.ts` supplies operational markers and route treatments that distinguish current, future, completed, candidate, selected, uncertain, and unavailable states through shape, weight, labels, and dash grammar. `provider-guides/google-map-style.json` is an optional neutral, medium-density guide for a user-owned Google Cloud map style. Set `VITE_GOOGLE_MAP_ID` to the user's own configured map ID. Without it, the provider fallback remains a real map and the live board stays legible around it.

## Responsive behavior and truthfulness

- `320`, `390`, and `430`: Now/Next stays above the map, the journey sheet is interruptible, and the completed history remains reachable below future stops.
- `768`: the composition becomes an operations rail, map, and journey sheet.
- `1024` and `1440`: the map grows between bounded rails while provider controls and attribution remain clear.
- At 200% text zoom, operational copy wraps in document flow without horizontal page overflow.

The board only renders the controller's instant, timezone, current/next owner IDs, route load result, route certainty, route source, authored timing, progress completion, and reservation/task facts. It never turns unknown timing into a countdown or invents a percentage route metric.

Keyboard focus is visible, forced colors preserve state through text, rules, and dash patterns, reduced motion is instant, and every action target is at least 44 by 44 CSS pixels.

## Anti-patterns

Do not turn this into a KPI dashboard, countdown clock, pulsing alert wall, red brand console, or automatic-scrolling feed. Keep disruption color tied to an actual error or unavailable state. Keep route owners independent and preserve candidate, shopping, reservation, task, location, focus, and failure semantics.
