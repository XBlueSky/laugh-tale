const DIRECTIONAL_VELOCITY_THRESHOLD = 0.5;
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
    const viewportHeight = finiteLength(input.viewportHeight);
    const topClearance = finiteLength(input.topClearance);
    const safeBottom = finiteLength(input.safeBottom);
    const collapsed = Math.round(finiteLength(input.collapsedHeight));
    const ceiling = Math.round(Math.max(collapsed, viewportHeight - topClearance - safeBottom));
    const expanded = ceiling;
    const halfTarget = Math.round((viewportHeight - safeBottom - collapsed) / 2);
    const half = Math.round(clampSheetHeight(halfTarget, { min: collapsed, max: expanded }));
    return { collapsed, half, expanded, ceiling };
}
export function nearestSheetSnap(height, geometry, velocityY = 0) {
    const points = [
        { snap: "collapsed", height: geometry.collapsed },
        { snap: "half", height: geometry.half },
        { snap: "expanded", height: geometry.expanded },
    ];
    points.sort((left, right) => left.height - right.height);
    const resolvedHeight = clampSheetHeight(height, {
        min: points[0]?.height ?? 0,
        max: points.at(-1)?.height ?? 0,
    });
    if (velocityY <= -DIRECTIONAL_VELOCITY_THRESHOLD) {
        return (points.find((point) => point.height > resolvedHeight + 0.5) ??
            points.at(-1)).snap;
    }
    if (velocityY >= DIRECTIONAL_VELOCITY_THRESHOLD) {
        return ([...points]
            .reverse()
            .find((point) => point.height < resolvedHeight - 0.5) ?? points[0]).snap;
    }
    return points.reduce((nearest, point) => Math.abs(point.height - resolvedHeight) <
        Math.abs(nearest.height - resolvedHeight)
        ? point
        : nearest).snap;
}
