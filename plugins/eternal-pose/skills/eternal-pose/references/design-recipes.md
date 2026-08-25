# Design Recipes

Treat a recipe as an agent-facing design brief selected at generation or restyling time, not as a runtime theme switcher or semantic schema.

## Select or create a direction

- Use `quiet-wood` only when the user gives no visual direction. Favor warm material cues, quiet hierarchy, low noise, and a practical travel-dashboard register.
- Use `sticker-brutalist` when the user wants bold outlines, hard shadows, bright sticker-like groupings, and high-recognition icons without copying reference-site assets.
- Use `native-minimal` when the user wants mobile-native hierarchy, quiet surfaces, and minimal decoration.
- Follow a user-supplied brand, screenshot, URL, or natural-language direction when authorized. A user may replace, combine, or rewrite recipes.
- Copy only the selected recipe into a generated site. Do not ship the whole recipe library or create a runtime theme selector unless requested.

## Define the recipe completely

Specify the product register and principles; primitive, semantic, and component tokens; typography; spacing; shapes; borders; elevation; icon language; map overlays; markers; routes; user location; sheet; header; renderers; candidate groups; motion; responsive density; accessibility; and anti-patterns.

Define behavior at 320, 390, and 430 CSS-pixel widths, short heights, and safe-area insets. Define forced-colors, contrast, touch targets, focus, interruption, and reduced-motion outcomes rather than decoration alone.

## Preserve mutable IA/UI

- Treat the generated home page, navigation, section order, renderer composition, copy, palette, typography, layout, and file organization as mutable user-owned design.
- Inspect an existing site's design system before Restyle or scoped Update. Extend or edit it coherently instead of restoring starter defaults.
- Preserve a custom home page and visual system during content and route updates unless the user explicitly includes them in scope.
- Permit a custom semantic type or merged renderer when its capabilities and accessible states remain explicit.

## Protect invariants

Never let a recipe remove the real map, map/list synchronization, independently owned route edges, draggable sheet geometry, candidate preview/commit distinction, timing certainty, focus restoration, keyboard support, 44-pixel targets, forced-colors usability, or reduced-motion interaction.

## Reject generic UI

- Avoid a grid of interchangeable gradient cards, decorative metric tiles, oversized empty hero copy, excessive glass blur, and unearned dashboard chrome.
- Avoid giving transport, tasks, places, and reservations identical card weight when their semantics differ.
- Avoid decoration that obscures provider failure, timing uncertainty, candidate state, selected day, or current/next status.
- Avoid motion that blocks input, auto-advances decisions, fights a drag, or becomes the only signal of state.
- Avoid copying official franchise logos, characters, fonts, screenshots, music, or signature visual assets into plugin or generated-site branding.
