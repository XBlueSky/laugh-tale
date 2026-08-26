# Quiet Wood

Quiet Wood is the practical default for a trip used outdoors, in transit, and while making quick decisions from a phone. Its warmth comes from restrained terracotta, warm dark ink, and material contrast—not a field of beige cards.

## Register

- Product register: travel utility, not a campaign page.
- Color strategy: restrained. Accent color marks current, selected, actionable, and focus states only.
- Tone: calm, tactile, direct, and low-noise.
- Icon language: Lucide line icons at the component's inherited color. Do not place every icon in a decorative bubble.

## Token contract

| Layer | Tokens | Rule |
| --- | --- | --- |
| Typography | `--font-body`, `--font-size-title`, `--font-size-meta` | One familiar UI family with a compact hierarchy. |
| Rhythm | `--space-1` through `--space-5` | Use varied spacing to show hierarchy; do not convert every group into a card. |
| Shape | `--border-thin`, `--radius-*` | Thin full borders and 8–16px corner radii. |
| Semantics | `--color-canvas`, `--color-text*`, `--color-surface*`, `--color-border*` | Canvas, surfaces, and small text keep verified contrast. |
| State | `--color-accent*`, `--color-selected*`, `--color-focus`, status colors | State colors communicate interaction, not decoration. |
| Components | marker, route, semantic-type surface, and shadow tokens | Every Task 7–9 surface consumes the same portable contract. |
| Motion | `--sheet-motion-duration`, `--component-motion-duration`, `--motion-easing` | 180–200ms state changes, zero under reduced motion. |

Runtime safe-area, header-clearance, and sheet geometry variables are owned by the experience shell, not this recipe.

## Component rules

- Keep the map, date header, map controls, and itinerary sheet visually related through the same thin border and warm dark ink.
- Keep the sheet toolbar compact. The itinerary rows, not a repeated summary panel, remain the primary content.
- Give each semantic type a quiet surface cue while retaining the same selection and focus grammar.
- Render current with a full inset outline, selected with a solid terracotta surface, and completed with text treatment rather than low-contrast opacity.
- Treat candidates, shopping controls, tasks, and reservations as progressive tools. Avoid nested surface-on-surface card stacks.
- Keep native select and dialog affordances recognizable.

## Map, markers, and routes

- The real map remains the canvas; never cover it with a decorative replacement.
- Default markers are warm light surfaces with a dark full border. Selected and user-location markers use the selected surface with high-contrast text.
- Route connectors stay lighter and narrower than stops. Expanded details use the route surface without becoming a second stop card.
- Candidate markers and list options share their stable number and selection state through the existing map/list contract.

## Motion

- Sheet and shell transitions use 200ms; component feedback uses 180ms with an ease-out curve.
- Motion communicates expand, collapse, selection, and focus changes only.
- Dragging always wins over a transition and can reverse an in-flight state change.
- `prefers-reduced-motion` sets all recipe-owned durations to `0ms` without removing any interaction.

## Responsive behavior

- At 320px, reduce horizontal padding and corner radius; candidate action buttons share the available row without overflow.
- At 390px, add a small amount of itinerary breathing room while preserving the map-first split.
- At 430px, widen home-page side padding, not the fixed mobile controls.
- Keep labels truncatable, long notes wrappable, dialogs inside safe areas, and every action at least 44px.
- Short-height and landscape geometry stays owned by the shared sheet resolver.

## Accessibility

- Small text pairings on canvas, surface, semantic surfaces, and selected states meet WCAG AA at 4.5:1 or better.
- Focus uses a visible solid outline and does not rely on shadow alone.
- Forced colors maps state to system `Canvas`, `CanvasText`, `Highlight`, and `HighlightText` values.
- Selected, current, candidate, completed, loading, and error states remain available in text or semantics in addition to color.
- Preserve keyboard order, native dialogs, native radio/select behavior, focus restoration, and 44px targets.

## Anti-patterns

- No decorative gradients, glass blur, side accent stripes, oversized hero metrics, or icon bubbles.
- No repeated beige card grid, nested cards, excessive pills, or shadow on every row.
- No duplicated transit summary, inset fake map, or decorative animation.
- No protected franchise art, logos, fonts, screenshots, or character likenesses.

## AI customization boundary

User AI may replace, mix, or rewrite this palette, typography, homepage, renderer composition, and information architecture. Keep the shared token names or update their contract tests together. Preserve the real map, map/list synchronization, route ownership, candidate preview versus commit, sheet geometry, focus restoration, reduced motion, forced colors, and touch targets.
