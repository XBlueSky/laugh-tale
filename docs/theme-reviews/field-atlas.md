# Field Atlas authored-world review

## Initial implementation record

The controller-owned browser pass and captures are pending. This record describes implemented hooks and the intended review matrix; it does not claim visual evidence that has not been captured.

- **Composition:** home uses one route overview, readiness facts, a compact reservation ledger, and an indexed day field. Experience uses a fixed atlas index, persistent map grid, asymmetrical legend, numbered timeline, and one bounded details surface rather than a floating card grid.
- **Map grammar:** indexed marker tokens, selected marker brackets, completed marker cuts, route casing, and uncertain-route dash patterns carry meaning without relying on accent hue.
- **Typography and density:** system UI text is paired with a system monospaced numeric/index layer at `VISUAL_DENSITY 8`.
- **Component language:** sharp ruled regions and cropped grid geometry replace rounded cards, pills, elevation, and glass.
- **Icon and status language:** operational text keys, route bands, check shapes, and boundary patterns identify current, selected, completed, uncertain, and failed states.
- **Motion:** `MOTION_INTENSITY 3`; only interruptible state transitions use the 180ms token, and reduced motion is instant.
- **Content framing:** recipe-owned copy is short and operational. Trip titles, notes, places, reservation data, and tasks render unchanged from the authored model.

## Pending controller browser matrix

The controller will inspect Home, default Experience, expanded Experience, candidate, reservation, task, setup-required, loading, map-error, and fatal-error at `320`, `390`, `430`, `768`, `1024`, and `1440` CSS pixels. The pass also covers 200% text zoom, keyboard traversal, reduced motion, forced colors, touch targets, overflow, and map attribution.

- Grayscale capture: pending controller browser pass (`docs/theme-reviews/assets/field-atlas-grayscale.png`).
- Accent substitution capture: pending controller browser pass (`docs/theme-reviews/assets/field-atlas-accent-substitution.png`).

No NPS, Felt, Mapbox, or other reference asset, screenshot, logo, proprietary font, or trademarked trade dress was copied. Their named references informed only general product and cartographic principles.
