import { buildRoutePresentations, } from "./routes.js";
function nodeEntry(effectiveNode) {
    return {
        kind: "node",
        id: effectiveNode.sourceNodeId,
        node: effectiveNode.node,
    };
}
/**
 * Builds the list-only projection of one effective day. Route edges retain
 * their own IDs and positions; visual grouping never transfers route
 * ownership into a node.
 */
export function buildTimelineEntries(day, effectiveTrip) {
    const dayRoutes = effectiveTrip.routes.filter((route) => route.dayId === day.day.id);
    const routePresentations = buildRoutePresentations({ ...day.day, routes: dayRoutes }, day.nodes);
    const routeEntriesByOrigin = new Map();
    for (const route of routePresentations) {
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
                    (routeEntriesByOrigin.get(previous.sourceNodeId)?.length ?? 0) > 0) {
                    break;
                }
                end += 1;
            }
            if (end > index) {
                const entries = day.nodes
                    .slice(index, end + 1)
                    .map(nodeEntry);
                const first = entries[0];
                const last = entries.at(-1);
                if (first !== undefined && last !== undefined) {
                    output.push({
                        kind: "logistics-group",
                        id: `logistics:${first.id}--${last.id}`,
                        entries,
                    });
                    output.push(...(routeEntriesByOrigin.get(last.id) ?? []));
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
