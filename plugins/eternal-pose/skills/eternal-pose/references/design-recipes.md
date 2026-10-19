# Design Recipes

Treat a recipe as an agent-facing design brief selected at generation or restyling time, not as a runtime theme switcher or semantic schema.

## Built-in catalog

The v2 source catalog contains one complete compile-time recipe:

| ID | Default use | Register | Source |
| --- | --- | --- | --- |
| `oak-washi` | Sole/default recipe at 2.0.0 | Oak ink, washi surfaces, editorial travel utility | `../../../recipes-v2/oak-washi/` |

Generation materializes the selected presentation and exactly one locale catalog into owned source. It does not ship recipe-only reference catalogs or a runtime theme selector. `trip.locale` controls authored Trip copy; empty starters require `--setup-locale`. See `workflow.md` for `--copy-catalog` requirements.

## Select or create a direction

- Use `oak-washi` when creating a site; `--recipe oak-washi` is optional because it is the default.
- Follow a user-supplied brand, screenshot, URL, or natural-language direction when authorized. A user may replace, combine, or rewrite recipes.
- Copy only the selected recipe into a generated site. Do not ship the whole recipe library or create a runtime theme selector unless requested.

## Replace, mix, or rewrite safely

Treat the generated presentation as a first draft. A user's AI may rewrite the visual system and information architecture from a supplied brand, screenshot, URL, or natural-language direction while preserving the experience contract.

Before editing an existing site:

1. Inspect its current tokens, component selectors, homepage, renderer composition, and interaction tests.
2. Identify user-owned changes and preserve them unless the request puts them in scope.
3. Keep one complete compile-time token contract; do not bolt on a runtime theme switcher.
4. Re-run recipe, starter, mobile, accessibility, and map/list contract gates after a visual or IA change.
5. If token names or stable selectors intentionally change, migrate the contract tests and project documentation in the same scoped change.

## Define the recipe completely

Specify the product register and principles; primitive, semantic, and component tokens; typography; spacing; shapes; borders; elevation; icon language; map overlays; markers; routes; user location; sheet; header; renderers; candidate groups; motion; responsive density; accessibility; and anti-patterns.

Define behavior at 320, 390, and 430 CSS-pixel widths, short heights, and safe-area insets. Define forced-colors, contrast, touch targets, focus, interruption, and reduced-motion outcomes rather than decoration alone.

Inspect the generated presentation's token and component contracts before changing styles. Preserve measured safe-area values, map padding, header clearance, and resolved sheet height. Verify small text on canvas, surface, semantic surfaces, and selected surfaces at WCAG AA 4.5:1 or better. Finish Restyle with Validate and Verify.

## Preserve mutable IA/UI

- Treat the generated home page, navigation, section order, renderer composition, copy, palette, typography, layout, and file organization as mutable user-owned design.
- Inspect an existing site's design system before Restyle or scoped Update. Extend or edit it coherently instead of restoring starter defaults.
- Preserve a custom home page and visual system during content and route updates unless the user explicitly includes them in scope.
- Permit a custom semantic type or merged renderer when its capabilities and accessible states remain explicit.

## Protect invariants

Never let a recipe remove the real map, map/list synchronization, independently owned route edges, draggable sheet geometry, candidate preview/commit distinction, timing certainty, focus restoration, keyboard support, 44-pixel targets, forced-colors usability, or reduced-motion interaction.

Keep route connectors visually between stops and lighter than itinerary nodes. Keep tasks outside the timeline. Keep candidate comparison on the persistent main map. Keep native select, radio, and dialog behavior unless a replacement proves equal mobile and accessibility behavior.

## Reject generic UI

- Avoid a grid of interchangeable gradient cards, decorative metric tiles, oversized empty hero copy, excessive glass blur, and unearned dashboard chrome.
- Avoid giving transport, tasks, places, and reservations identical card weight when their semantics differ.
- Avoid decoration that obscures provider failure, timing uncertainty, candidate state, selected day, or current/next status.
- Avoid motion that blocks input, auto-advances decisions, fights a drag, or becomes the only signal of state.
- Avoid side accent stripes, gradient text, decorative glass, icon bubbles, excessive pills, novelty control shapes, and nested-card inflation.
- Avoid warm-neutral card grids as a shortcut for “friendly” design; carry warmth through deliberate accent, ink, typography, and material contrast.
- Avoid copying official franchise logos, characters, fonts, screenshots, music, or signature visual assets into plugin or generated-site branding.
