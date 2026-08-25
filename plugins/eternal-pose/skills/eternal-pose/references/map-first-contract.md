# Map-first Contract

Protect these interaction outcomes across any design, framework structure, or renderer implementation.

## Real map and shared state

- Use a functioning real map as the base of each single-day workspace. Do not substitute a decorative illustration, screenshot, or fake canvas for a configured provider.
- Keep map and itinerary list as two views of one selection state. Selecting a marker must locate and focus its list item; selecting a list item must focus its marker.
- Show all locatable choices on the primary map during candidate comparison. After commitment and collapse, retain only the selected candidate for that group.
- Keep the itinerary readable and external navigation usable when map, place, or route services fail. Display the truthful failure/configuration state.

## Draggable mobile sheet

- Place the itinerary in a bottom sheet above the map with stable `collapsed`, `half`, and `expanded` snap points.
- Resolve one shared sheet ceiling from viewport height, safe areas, measured header, short-screen constraints, and orientation. Use that ceiling for layout, dragging, snapping, and map padding.
- Keep pointer movement direct and interruptible. A new drag must take control from an in-flight snap animation; do not let a transition cancel live pointer movement.
- Let expanded cover most of the map only when one obvious gesture or control returns to the map.
- Preserve the full interaction under `prefers-reduced-motion`; remove nonessential interpolation, not states or controls.
- Avoid fixed heights that overflow at 320, 390, or 430 CSS-pixel widths and at short landscape-like heights.

## Routes

- Give every route edge its own stable ID, endpoints, travel mode, source/certainty, and optional duration, distance, normalized path, steps, and external navigation target.
- Never store an edge as visual ownership such as `routeFromPrevious` on a node. A connector may render between rows, but selection, focus, cache, map drawing, and tests must use the edge ID.
- Keep each interactive route owner present at most once. Do not pair a working route control with a duplicate dead summary.
- Collapse a walking connector estimated at five minutes or less to a quiet icon/label or omit its prose by default, while retaining the edge in core state, map drawing, navigation, and audit.
- Expand a short walk when accessibility, special entrances, uncertainty, or user direction needs detail. Treat five minutes as a presentation default, never a deletion rule.
- When filtering skips an intermediate node, clear stale adjacent steps, schedules, and preferences from the recomposed edge and mark it recomposed or estimated.
- Never draw a fake ground line after route failure. A flight may use an explicitly non-ground geodesic or curated presentation.

## Focus and accessibility

- Restore focus to the initiating control after candidate confirmation, dialog close, or sheet-mode changes that replace content.
- Make sheet states, selected nodes, candidate numbers, timing certainty, and provider failures available to assistive technology.
- Support keyboard operation, logical reading order, visible focus, at least 44-by-44 CSS-pixel touch targets, sufficient contrast, and usable forced-colors mode.
- Keep focus stable through map/list synchronization; do not steal focus on passive map movement or geolocation updates.
- Use browser geolocation only after explicit user action. Focus the first valid location once, update the marker thereafter, and provide a separate recenter control.
