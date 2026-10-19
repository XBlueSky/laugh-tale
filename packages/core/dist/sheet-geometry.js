function finiteLength(value) {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}
export function clampSheetHeight(height, bounds) {
    const minimum = Math.min(bounds.min, bounds.max);
    const maximum = Math.max(bounds.min, bounds.max);
    const resolved = Number.isFinite(height) ? height : minimum;
    return Math.min(maximum, Math.max(minimum, resolved));
}
export function resolveSheetGeometry(input) {
    const collapsed = Math.round(finiteLength(input.collapsedHeight));
    const expanded = Math.max(collapsed, Math.round(finiteLength(input.expandedHeight)));
    const half = Math.round(clampSheetHeight(finiteLength(input.halfHeight), {
        min: collapsed,
        max: expanded,
    }));
    return { collapsed, half, expanded, ceiling: expanded };
}
export function nearestSheetSnap(height, geometry) {
    return ["collapsed", "half", "expanded"].reduce((best, snap) => Math.abs(geometry[snap] - height) < Math.abs(geometry[best] - height)
        ? snap
        : best);
}
