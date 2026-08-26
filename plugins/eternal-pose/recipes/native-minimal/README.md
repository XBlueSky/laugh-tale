# Native Minimal

Native Minimal is the quietest option. It uses a system-adjacent type stack, flat surfaces, restrained blue state color, subtle separators, and sparse decoration so the tool disappears into the trip.

## Register

- Product register: familiar mobile utility.
- Color strategy: restrained neutral surfaces with one accessible action blue.
- Tone: clear, immediate, calm, and platform-adjacent.
- Icon language: Lucide line icons used only for real actions and travel modes.

## Token contract

| Layer | Tokens | Rule |
| --- | --- | --- |
| Typography | `--font-body`, `--font-size-title`, `--font-size-meta` | One system-adjacent family and a tight fixed scale. |
| Rhythm | `--space-1` through `--space-5` | Familiar compact density with sparse grouping. |
| Shape | `--border-thin`, `--radius-*` | 1px separators and moderate control/sheet radii. |
| Semantics | canvas, text, surface, border, and semantic-type surface tokens | Near-neutral layers separate map tools, sheet, and content without card inflation. |
| State | accent, selected, focus, and status tokens | Blue is reserved for action, selection, and focus. |
| Components | marker, route, and low-elevation shadow tokens | Elevation belongs to floating shells and markers only. |
| Motion | shared sheet, component, and easing tokens | 180ms state motion, zero under reduced motion. |

Runtime safe-area values, map padding, header clearance, and sheet geometry are intentionally outside the recipe contract.

## Component rules

- Keep the date header, map controls, and sheet on plain white surfaces with subtle separators.
- Render itinerary nodes as list rows rather than a stack of floating cards.
- Give each semantic type a very light surface cue while preserving one selected-state grammar.
- Use separators for task, reservation, shopping, and candidate lists; avoid nested containers.
- Keep disclosure, native select, radio, and native dialog affordances conventional.
- Keep the home compact and task-oriented rather than turning it into a hero page.

## Map, markers, and routes

- The real map remains visible and persistent beneath the mobile sheet.
- Markers use a white surface, dark border, and minimal shadow; selected and user-location markers use accessible blue with white content.
- Route connectors remain borderless, compact, and secondary. Expanded route details use a subtle neutral surface.
- Candidate markers and list controls share numbering and selection through the existing map/list contract.

## Motion

- Use 180ms ease-out for state changes in controls, rows, and sheet chrome.
- Do not animate layout owned by the experience shell and do not add page-load choreography.
- Dragging can interrupt and reverse an in-flight sheet transition.
- Reduced motion sets all recipe-owned durations to `0ms` without disabling expand, collapse, selection, or drag.

## Responsive behavior

- At 320px, reduce side padding and keep two candidate actions sharing one row without overflow.
- At 390px, add a single spacing step inside the itinerary scroll region.
- At 430px, add home-page margin only; do not inflate controls or type.
- Use truncation for compact labels, wrapping for authored notes, safe-area dialog bounds, and a minimum 44px target.

## Accessibility

- Small text on canvas, white surfaces, subtle surfaces, semantic rows, and selected blue meets WCAG AA 4.5:1 or better.
- Focus uses a visible 2px outline independent of shadow.
- Forced colors restores full borders where subtle separators would disappear and uses system colors.
- State remains available through labels, attributes, and native semantics in addition to color.
- Preserve keyboard order, focus restoration, native dialog/select/radio behavior, and 44px targets.

## Anti-patterns

- No decorative gradients, glass blur, side stripes, icon bubbles, oversized headings, or floating-card grids.
- No custom control that replaces a reliable native mobile picker or dialog.
- No low-contrast gray text, hidden focus, decorative transition, or map-like placeholder.
- No protected franchise logos, characters, fonts, screenshots, or signature art direction.

## AI customization boundary

User AI may replace, mix, or rewrite this visual system, homepage, renderer layout, and information architecture. Preserve the shared token names or migrate their contract tests with the change. Keep the real map, map/list synchronization, route ownership, candidate preview/commit separation, sheet geometry, focus restoration, reduced motion, forced colors, and touch targets intact.
