import { Navigation } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import type { RouteEdge } from "../trip-core/model";
import type { EffectiveNode } from "../trip-core/resolve-itinerary";
import { formatTimingLabel } from "../trip-core/time";
import type { TripSelection } from "../experience-shell/useTripSelection";

export interface ItineraryTimelineProps {
  nodes: readonly EffectiveNode[];
  routes: readonly RouteEdge[];
  selection: TripSelection;
  onNodeSelect: (nodeId: string) => void;
}

function routeKey(fromNodeId: string, toNodeId: string): string {
  return `${fromNodeId.length}:${fromNodeId}${toNodeId}`;
}

export function ItineraryTimeline({
  nodes,
  routes,
  selection,
  onNodeSelect,
}: ItineraryTimelineProps) {
  const nodeElementsRef = useRef(new Map<string, HTMLLIElement>());
  const routesByAdjacency = useMemo(() => {
    const owners = new Set<string>();
    const byAdjacency = new Map<string, RouteEdge[]>();
    for (const route of routes) {
      if (owners.has(route.id)) {
        continue;
      }
      owners.add(route.id);
      const key = routeKey(route.fromNodeId, route.toNodeId);
      const adjacencyRoutes = byAdjacency.get(key) ?? [];
      adjacencyRoutes.push(route);
      byAdjacency.set(key, adjacencyRoutes);
    }
    return byAdjacency;
  }, [routes]);

  useEffect(() => {
    if (selection.nodeId === null) {
      return;
    }
    nodeElementsRef.current
      .get(selection.nodeId)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [selection.nodeId]);

  return (
    <ol className="itinerary-timeline" aria-label="Day itinerary">
      {nodes.map((effectiveNode, index) => {
        const { node, sourceNodeId } = effectiveNode;
        const selected = selection.nodeId === sourceNodeId;
        const next = nodes[index + 1];
        const ownedRoutes =
          next === undefined
            ? []
            : (routesByAdjacency.get(
                routeKey(sourceNodeId, next.sourceNodeId),
              ) ?? []);
        return (
          <li
            key={sourceNodeId}
            ref={(element) => {
              if (element === null) {
                nodeElementsRef.current.delete(sourceNodeId);
              } else {
                nodeElementsRef.current.set(sourceNodeId, element);
              }
            }}
            className="itinerary-timeline__entry"
          >
            <button
              type="button"
              className="itinerary-row"
              aria-label={`${formatTimingLabel(node.timing)} ${node.title}`}
              aria-pressed={selected}
              data-kind={node.kind}
              data-completed={effectiveNode.completed ? "true" : "false"}
              data-selection-source={selected ? selection.source : undefined}
              data-touch-target="44"
              onClick={() => onNodeSelect(sourceNodeId)}
            >
              <span className="itinerary-row__time">
                {formatTimingLabel(node.timing)}
              </span>
              <span className="itinerary-row__title">{node.title}</span>
            </button>

            {ownedRoutes.map((route) => (
              <div
                key={route.id}
                className="route-connector"
                aria-label={`Route from ${node.title} to ${next?.node.title ?? "next stop"}`}
                data-route-owner={route.id}
              >
                <Navigation aria-hidden="true" size={17} strokeWidth={1.8} />
                <span>{route.summary ?? route.mode}</span>
              </div>
            ))}
          </li>
        );
      })}
    </ol>
  );
}
