import { buildRoutePresentations, } from "./routes.js";
function nodeEntry(effectiveNode) {
    return {
        kind: "node",
        id: effectiveNode.sourceNodeId,
        node: effectiveNode.node,
    };
}
function fallbackRoutePresentation(route) {
    return {
        edge: route,
        display: route.mode === "walking" && route.durationMinutes !== undefined && route.durationMinutes <= 5
            ? "compact"
            : "full",
        navigable: route.navigation !== undefined && route.navigation.origin.trim().length > 0 && route.navigation.destination.trim().length > 0,
    };
}
/**
 * Builds the list-only projection of one effective day. Route edges retain
 * their own IDs and positions; visual grouping never transfers route
 * ownership into a node.
 */
export function buildTimelineEntries(day, effectiveTrip) {
    const dayRoutes = effectiveTrip.routes.filter((route) => route.dayId === day.day.id);
    const routePresentations = buildRoutePresentations({ ...day.day, routes: dayRoutes }, day.nodes.filter(({ skipped }) => !skipped));
    const canonicalRoutes = new Map(routePresentations.map((route) => [route.edge.id, route]));
    const activeNodeIds = new Set(day.nodes.filter(({ skipped }) => !skipped).map(({ sourceNodeId }) => sourceNodeId));
    const retainedRoutePresentations = [
        ...routePresentations,
        ...dayRoutes.flatMap((route) => canonicalRoutes.has(route.id) ||
            !activeNodeIds.has(route.fromNodeId) ||
            !activeNodeIds.has(route.toNodeId)
            ? []
            : [fallbackRoutePresentation(route)]),
    ];
    const routesConnect = (leftId, rightId) => retainedRoutePresentations.some(({ edge }) => (edge.fromNodeId === leftId && edge.toNodeId === rightId) ||
        (edge.fromNodeId === rightId && edge.toNodeId === leftId));
    const routeEntriesByOrigin = new Map();
    for (const route of retainedRoutePresentations) {
        const entries = routeEntriesByOrigin.get(route.edge.fromNodeId) ?? [];
        entries.push({ kind: "route", id: route.edge.id, route });
        routeEntriesByOrigin.set(route.edge.fromNodeId, entries);
    }
    const output = [];
    for (let index = 0; index < day.nodes.length;) {
        const current = day.nodes[index];
        if (current === undefined) {
            break;
        }
        if (current.node.kind === "logistics") {
            let end = index;
            while (end + 1 < day.nodes.length) {
                const candidate = day.nodes[end + 1];
                const previous = day.nodes[end];
                if (candidate?.node.kind !== "logistics" ||
                    previous === undefined ||
                    routesConnect(previous.sourceNodeId, candidate.sourceNodeId)) {
                    break;
                }
                end += 1;
            }
            if (end > index) {
                const entries = day.nodes
                    .slice(index, end + 1)
                    .map(nodeEntry);
                const first = entries[0];
                if (first !== undefined) {
                    output.push({
                        kind: "logistics-group",
                        id: `logistics-group:${JSON.stringify(entries.map(({ id }) => id))}`,
                        entries,
                    });
                    output.push(...entries.flatMap(({ id }) => routeEntriesByOrigin.get(id) ?? []));
                    index = end + 1;
                    continue;
                }
            }
        }
        output.push(nodeEntry(current));
        output.push(...(routeEntriesByOrigin.get(current.sourceNodeId) ?? []));
        index += 1;
    }
    return output;
}
