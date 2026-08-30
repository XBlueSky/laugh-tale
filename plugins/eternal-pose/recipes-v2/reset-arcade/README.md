# Reset Arcade

Reset Arcade is a tactile mission board for trips that feel better as a sequence of deliberate decisions. Its identity comes from numbered missions, a persistent board map, a stage rail, full ink rules, and hard offset shadows. It uses a system UI stack and a compact system index layer; no fonts or image assets are downloaded.

## Customization levels

1. **Token customization:** edit `presentation/styles/tokens.css` to change the board surfaces, ink, accent, spacing, shadow depth, and state timing.
2. **Component customization:** replace a local mission selector, stage timeline, map surface, decision panel, utility dialog, or state view under `presentation/components/`.
3. **Presentation customization:** replace the full `presentation/` tree while keeping the local controller contract and provider boundary.
4. **Full UI replacement:** replace the generated app and presentation with another UI built directly on the pinned headless packages.

There is no npm theme dependency and no runtime theme selector. Generated source is locally owned.

## Map profile and Cloud style guide

`presentation/theme-map-profile.ts` supplies numbered board markers, a location marker, and route treatments that remain distinguishable by mode, certainty, source, and selection. `provider-guides/google-map-style.json` is an optional flat, low-density guide for a user-owned Google Cloud map style. Set `VITE_GOOGLE_MAP_ID` to the user's own configured map ID. Without it, the provider fallback remains a real map and the local board grammar stays visible around it.

## Responsive behavior

- `320`, `390`, and `430`: the board map stays persistent, the mission header folds, and the stage list lives in an interruptible bottom sheet with collapsed, half, and expanded snaps.
- `768`: the composition becomes a three-zone workspace with a mission rail, map, and stage sheet.
- `1024` and `1440`: the map grows between bounded rails while provider controls and attribution remain clear.
- At 200% text zoom, mission names and trip-authored facts wrap inside their regions without horizontal page overflow.

Keyboard focus is always visible. Forced colors preserve selected, current, completed, uncertain, and error states through outlines, borders, labels, and dash grammar. Reduced motion makes state changes instant. Controls and label-backed inputs meet a 44 by 44 CSS-pixel target.

## Anti-patterns

Do not turn the board into a fake game score, a cyberpunk console, a glowing or animated backdrop, a gradient card grid, or a novelty control system. Do not invent achievements, countdowns, map readiness, coordinates, reservations, or progress values. Keep route edges independent, keep the real map primary, and preserve the controller's candidate, task, shopping, reservation, focus, and failure semantics.
