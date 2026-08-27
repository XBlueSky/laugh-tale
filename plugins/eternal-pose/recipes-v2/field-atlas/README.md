# Field Atlas

Field Atlas is a map-first outdoor field tool. Its identity comes from the persistent map grid, fixed atlas index, numbered stop grammar, ruled route bands, and one bounded detail surface. The base is cool achromatic and mineral with one cobalt survey accent. It uses system UI text and a system monospaced numeric layer, so it does not download fonts or visual assets.

## Customization levels

1. **Token customization:** edit `presentation/styles/tokens.css` to change the mineral ramp, `--atlas-accent`, typography, density, rules, and state transition timing.
2. **Component customization:** replace a local map surface, timeline, decision, utility panel, or state view under `presentation/components/`.
3. **Presentation customization:** replace the full `presentation/` tree while retaining the local controller contract and provider boundary.
4. **Full UI replacement:** replace the generated app, controllers, and presentation with another UI built directly on the pinned headless packages.

There is no npm theme dependency and no runtime theme selector. Generated source is locally owned.

## Map profile and Cloud style guide

`presentation/theme-map-profile.ts` controls numbered markers, the user-location crosshair, decisive route casing, and non-color dash semantics for recomposed or uncertain routes. `provider-guides/google-map-style.json` is an optional neutral mineral guide for a user-owned Google Cloud map style. Set `VITE_GOOGLE_MAP_ID` to the user's own configured map ID. Without it, overlays retain the Field Atlas marker and route grammar over the documented neutral provider fallback.

## Responsive behavior

- `320`, `390`, and `430`: the map remains persistent. The atlas index folds, and the bounded details surface keeps collapsed, half, and expanded snaps above safe areas.
- `768`: the composition switches to a fixed index beside the map and a bounded details rail.
- `1024` and `1440`: the map grows as the primary field while the index and details rail remain width-bounded. Attribution and provider controls stay unobstructed.
- At 200% text zoom, regions reflow without horizontal page overflow; dense labels wrap within their own ruled region.

Keyboard focus is always visible. Forced colors preserve selected, completed, uncertain, current, and error shapes through borders, outlines, and dash grammar. Reduced motion makes state changes instant. Interactive controls and label-backed inputs provide at least 44 by 44 CSS pixels.

## Anti-patterns

Do not introduce warm beige or terracotta, faux aged surfaces, rounded card grids, pill clusters, gradients, blur, glass, decorative texture, random rotation, remote fonts, or remote assets. Do not turn route owners into place rows, hide map attribution, soften the interface into a generic card dashboard, or add load choreography. Motion is reserved for interruptible state feedback. Recipe-owned copy stays concise and operational; trip-authored titles, notes, places, and booking content are never rewritten.
