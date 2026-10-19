function clipOcclusion(viewport, rect) {
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite))
        return null;
    const left = Math.max(0, rect.x);
    const top = Math.max(0, rect.y);
    const right = Math.min(viewport.width, rect.x + Math.max(0, rect.width));
    const bottom = Math.min(viewport.height, rect.y + Math.max(0, rect.height));
    return right > left && bottom > top
        ? { x: left, y: top, width: right - left, height: bottom - top }
        : null;
}
function compareRects(left, right) {
    return left.y - right.y
        || left.x - right.x
        || left.width - right.width
        || left.height - right.height;
}
function normalizeOcclusions(viewport, occlusions) {
    const normalized = occlusions
        .map((rect) => clipOcclusion(viewport, rect))
        .filter((rect) => rect !== null)
        .sort(compareRects);
    return normalized.filter((rect, index) => {
        const previous = normalized[index - 1];
        return previous === undefined || compareRects(previous, rect) !== 0;
    });
}
function overlaps(left, right) {
    return left.x < right.x + right.width
        && left.x + left.width > right.x
        && left.y < right.y + right.height
        && left.y + left.height > right.y;
}
function containsViewportCenter(region, viewport) {
    const centerX = viewport.width / 2;
    const centerY = viewport.height / 2;
    return centerX >= region.x
        && centerX <= region.x + region.width
        && centerY >= region.y
        && centerY <= region.y + region.height;
}
function choosePreferredRegion(current, candidate, viewport) {
    if (current === null)
        return candidate;
    const currentArea = current.width * current.height;
    const candidateArea = candidate.width * candidate.height;
    if (candidateArea !== currentArea)
        return candidateArea > currentArea ? candidate : current;
    const currentContainsCenter = containsViewportCenter(current, viewport);
    const candidateContainsCenter = containsViewportCenter(candidate, viewport);
    if (candidateContainsCenter !== currentContainsCenter) {
        return candidateContainsCenter ? candidate : current;
    }
    if (candidate.width !== current.width)
        return candidate.width > current.width ? candidate : current;
    if (candidate.y !== current.y)
        return candidate.y < current.y ? candidate : current;
    return candidate.x < current.x ? candidate : current;
}
function resolveUsableRegion(viewport, occlusions) {
    const xEdges = [...new Set([0, viewport.width, ...occlusions.flatMap(({ x, width }) => [x, x + width])])].sort((left, right) => left - right);
    const yEdges = [...new Set([0, viewport.height, ...occlusions.flatMap(({ y, height }) => [y, y + height])])].sort((left, right) => left - right);
    let best = null;
    for (let leftIndex = 0; leftIndex < xEdges.length - 1; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < xEdges.length; rightIndex += 1) {
            for (let topIndex = 0; topIndex < yEdges.length - 1; topIndex += 1) {
                for (let bottomIndex = topIndex + 1; bottomIndex < yEdges.length; bottomIndex += 1) {
                    const candidate = {
                        x: xEdges[leftIndex],
                        y: yEdges[topIndex],
                        width: xEdges[rightIndex] - xEdges[leftIndex],
                        height: yEdges[bottomIndex] - yEdges[topIndex],
                    };
                    if (!occlusions.some((rect) => overlaps(candidate, rect))) {
                        best = choosePreferredRegion(best, candidate, viewport);
                    }
                }
            }
        }
    }
    return best;
}
export function resolveMapLayout(viewport, occlusions) {
    if (![viewport.width, viewport.height].every(Number.isFinite)
        || viewport.width <= 0
        || viewport.height <= 0) {
        return null;
    }
    const normalizedOcclusions = normalizeOcclusions(viewport, occlusions);
    const usableRegion = resolveUsableRegion(viewport, normalizedOcclusions);
    if (usableRegion === null)
        return null;
    const edgeInsets = {
        top: usableRegion.y,
        right: viewport.width - usableRegion.x - usableRegion.width,
        bottom: viewport.height - usableRegion.y - usableRegion.height,
        left: usableRegion.x,
    };
    return {
        viewport: { ...viewport },
        occlusions: normalizedOcclusions,
        usableRegion,
        edgeInsets,
    };
}
const changed = (left, right) => Math.abs(left - right) >= 1;
function rectangleChanged(left, right) {
    return changed(left.x, right.x)
        || changed(left.y, right.y)
        || changed(left.width, right.width)
        || changed(left.height, right.height);
}
export function hasMaterialMapLayoutChange(previous, next) {
    if (previous === null || next === null)
        return previous !== next;
    if (changed(previous.viewport.width, next.viewport.width)
        || changed(previous.viewport.height, next.viewport.height)
        || previous.occlusions.length !== next.occlusions.length
        || rectangleChanged(previous.usableRegion, next.usableRegion)
        || changed(previous.edgeInsets.top, next.edgeInsets.top)
        || changed(previous.edgeInsets.right, next.edgeInsets.right)
        || changed(previous.edgeInsets.bottom, next.edgeInsets.bottom)
        || changed(previous.edgeInsets.left, next.edgeInsets.left)) {
        return true;
    }
    return previous.occlusions.some((rect, index) => rectangleChanged(rect, next.occlusions[index]));
}
export const CAMERA_POLICY_V2 = Object.freeze({
    focusMinimumZoom: 15,
    focusMaximumZoom: 18,
    userLocationZoom: 16,
    fitMaximumZoom: 15,
});
function resolveIntentBase(context) {
    if (context.intentId.trim().length === 0)
        return null;
    return {
        intentId: context.intentId,
        transition: context.reducedMotion ? "immediate" : "animate",
        viewport: { ...context.layout.viewport },
        usableRegion: { ...context.layout.usableRegion },
        edgeInsets: { ...context.layout.edgeInsets },
    };
}
function validCoordinate({ lat, lng }) {
    return Number.isFinite(lat)
        && lat >= -90
        && lat <= 90
        && Number.isFinite(lng)
        && lng >= -180
        && lng <= 180;
}
function resolveFocusZoom(snapshot) {
    const zoom = snapshot?.zoom;
    if (zoom === undefined || !Number.isFinite(zoom)) {
        return CAMERA_POLICY_V2.focusMinimumZoom;
    }
    return Math.min(CAMERA_POLICY_V2.focusMaximumZoom, Math.max(CAMERA_POLICY_V2.focusMinimumZoom, zoom));
}
export function resolveFitCameraIntent(context, geometry) {
    const base = resolveIntentBase(context);
    if (base === null)
        return null;
    const points = geometry.points
        .filter(validCoordinate)
        .map((point) => ({ ...point }));
    const paths = geometry.paths
        .filter((path) => path.length >= 2 && path.every(validCoordinate))
        .map((path) => path.map((point) => ({ ...point })));
    if (points.length === 0 && paths.length === 0)
        return null;
    return {
        ...base,
        kind: "fit",
        points,
        paths,
        maximumZoom: CAMERA_POLICY_V2.fitMaximumZoom,
    };
}
export function resolveFocusCameraIntent(context, coordinate, snapshot) {
    const base = resolveIntentBase(context);
    return base === null || !validCoordinate(coordinate)
        ? null
        : {
            ...base,
            kind: "focus",
            coordinate: { ...coordinate },
            targetZoom: resolveFocusZoom(snapshot),
        };
}
export function resolveRecenterUserCameraIntent(context, coordinate) {
    const base = resolveIntentBase(context);
    return base === null || !validCoordinate(coordinate)
        ? null
        : {
            ...base,
            kind: "recenter-user",
            coordinate: { ...coordinate },
            targetZoom: CAMERA_POLICY_V2.userLocationZoom,
        };
}
export function reframeCameraIntent(intent, layout) {
    return {
        ...intent,
        transition: "immediate",
        viewport: { ...layout.viewport },
        usableRegion: { ...layout.usableRegion },
        edgeInsets: { ...layout.edgeInsets },
    };
}
