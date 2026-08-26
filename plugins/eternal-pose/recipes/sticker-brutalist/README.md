# Sticker Brutalist

Sticker Brutalist is the bold compile-time option: flat bright fills, heavy ink, 2–3px outlines, and hard offset shadows. It borrows a broad print-and-sticker design language without copying any reference product or protected asset.

## Register

- Product register: high-recognition travel utility.
- Color strategy: a deliberate small palette of blue, yellow, and semantic flat fills.
- Tone: direct, energetic, legible, and mechanically consistent.
- Icon language: Lucide line icons with heavier surrounding structure; icons still indicate actions or modes rather than decorate every line.

## Token contract

| Layer | Tokens | Rule |
| --- | --- | --- |
| Typography | `--font-body`, `--font-size-title`, `--font-size-meta` | Familiar system type with stronger weight, never novelty display type in controls. |
| Rhythm | `--space-1` through `--space-5` | Compact product density with visible grouping. |
| Shape | `--border-thin`, `--radius-*` | 2px baseline, occasional 3px shell edge, small deliberate radii. |
| Semantics | `--color-canvas`, text, surface, border, and semantic-type surface tokens | Flat fills retain dark readable ink. |
| State | accent, selected, focus, success, warning, and danger tokens | Selected is saturated blue with white text; focus is a separate red outline. |
| Components | marker, route, and hard-shadow tokens | Shadows express press depth only and never substitute for focus. |
| Motion | shared sheet, component, and easing tokens | 180ms press and state feedback, zero under reduced motion. |

Safe areas, header clearance, map padding, and sheet heights remain runtime geometry owned by the experience shell.

## Component rules

- Use full ink borders and flat fills for headers, controls, semantic rows, and dialogs.
- Use a hard shadow on the primary shell, selected controls, and direct action surfaces; do not shadow every nested item.
- Keep semantic type colors distinct while preserving one control grammar and one selected treatment.
- Use small physical press offsets for active controls. Do not animate layout or add bounce.
- Keep transport edges compact between stops, even when their border is visually assertive.
- Retain native radio, select, and dialog behavior.

## Map, markers, and routes

- The persistent real map remains the main comparison surface.
- Default markers use yellow with a dark 2px border and hard 3px shadow. Selected and user-location markers switch to blue with white content.
- Route connectors use a dashed full outline and compact label; transit detail replaces the summary through the existing interaction.
- Candidate numbers, markers, and list options stay synchronized through the map/list state.

## Motion

- All standard transitions are 180ms ease-out.
- Press feedback uses a small translation and shadow change; no bounce, elastic easing, stagger, or page-load choreography.
- Dragging remains direct and interruptible because recipe CSS does not own sheet height.
- Reduced motion sets recipe-owned motion to `0ms` and removes press translation while retaining state changes.

## Responsive behavior

- At 320px, reduce radii and side padding; split candidate actions evenly and prevent labels from forcing horizontal overflow.
- At 390px, keep the denser sticker rhythm while adding only one spacing step to the scroll region.
- At 430px, use the extra width for content padding rather than larger controls or type.
- Long notes wrap, compact routes stay compact, dialogs honor safe areas, and controls remain at least 44px.

## Accessibility

- Small dark text on every flat fill exceeds WCAG AA 4.5:1; selected white-on-blue also exceeds 4.5:1.
- A 3px focus outline remains visible independently from hard shadows.
- Forced colors removes decorative shadows and maps the interface to system colors.
- Current, selected, completed, candidate, loading, and error states keep non-color semantics.
- Preserve focus restoration, native controls, keyboard operation, and 44px targets.

## Anti-patterns

- No decorative gradients, image textures, glass, side stripes, or fake torn-paper effects.
- No copyrighted mascots, logos, signature artwork, or cloned reference-site composition.
- No cartoon font in labels, uncontrolled rainbow palette, permanent wobble, or motion for decoration.
- No full-card transport edges, inset fake maps, or duplicate candidate controls.

## AI customization boundary

User AI may replace, mix, or rewrite the colors, border language, homepage, type renderers, or wider information architecture. Preserve or deliberately migrate the shared token contract and its tests. The real map, map/list synchronization, route-edge ownership, candidate draft/commit behavior, sheet geometry, reduced motion, forced colors, focus, and 44px targets stay protected.
