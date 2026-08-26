import { useEffect, useMemo, useRef } from "react";

import type { RouteEdge, ShoppingStatus } from "../trip-core/model";
import type {
  EffectiveDay,
  EffectiveNode,
  EffectiveTrip,
} from "../trip-core/resolve-itinerary";
import type { TripSelection } from "../experience-shell/useTripSelection";
import { rendererFor } from "./renderers/CustomEntry";
import { RouteConnector, type RouteConnectorState } from "./timeline/RouteConnector";
import { TimelineEntry, type TimelineNodeState } from "./timeline/TimelineEntry";
import {
  buildTimelineEntries,
  type NodeEntry,
} from "./timeline/build-timeline-entries";

export interface ItineraryTimelineProps {
  nodes: readonly EffectiveNode[];
  routes: readonly RouteEdge[];
  selection: TripSelection;
  onNodeSelect: (nodeId: string) => void;
  routeStates?: Readonly<Record<string, RouteConnectorState>>;
  routeNavigationHrefs?: Readonly<Record<string, string>>;
  onRouteSelect?: (routeId: string) => void;
  onRouteRetry?: (routeId: string) => void;
  dayDate?: string;
  completedChecklistIds?: ReadonlySet<string>;
  shoppingStatuses?: Readonly<Record<string, ShoppingStatus>>;
  reducedMotion?: boolean;
  currentNodeId?: string | null;
}

function inferredDate(dayId: string): string | undefined {
  const match = dayId.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0];
}

function projection(
  nodes: readonly EffectiveNode[],
  routes: readonly RouteEdge[],
  dayDate: string | undefined,
): { day: EffectiveDay; trip: Pick<EffectiveTrip, "routes"> } {
  const dayId = nodes[0]?.node.dayId ?? routes[0]?.dayId ?? "timeline-day";
  return {
    day: {
      day: {
        id: dayId,
        date: dayDate ?? inferredDate(dayId) ?? "",
        title: "Day itinerary",
        nodes: nodes.map(({ node }) => node),
      },
      nodes: [...nodes],
    },
    trip: { routes: [...routes] },
  };
}

export function ItineraryTimeline({
  nodes,
  routes,
  selection,
  onNodeSelect,
  routeStates = {},
  routeNavigationHrefs = {},
  onRouteSelect,
  onRouteRetry,
  dayDate,
  completedChecklistIds = new Set<string>(),
  shoppingStatuses = {},
  reducedMotion,
  currentNodeId = null,
}: ItineraryTimelineProps) {
  const nodeElementsRef = useRef(new Map<string, HTMLLIElement>());
  const timelineProjection = useMemo(
    () => projection(nodes, routes, dayDate),
    [dayDate, nodes, routes],
  );
  const entries = useMemo(
    () => buildTimelineEntries(timelineProjection.day, timelineProjection.trip),
    [timelineProjection],
  );
  const effectiveNodesById = useMemo(
    () => new Map(nodes.map((node) => [node.sourceNodeId, node])),
    [nodes],
  );
  const positionById = useMemo(() => {
    const output = new Map<string, TimelineNodeState["position"]>();
    nodes.forEach(({ sourceNodeId }, index) => {
      output.set(
        sourceNodeId,
        nodes.length === 1
          ? "only"
          : index === 0
            ? "first"
            : index === nodes.length - 1
              ? "last"
              : "middle",
      );
    });
    return output;
  }, [nodes]);

  useEffect(() => {
    if (selection.nodeId === null) {
      return;
    }
    nodeElementsRef.current
      .get(selection.nodeId)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [selection.nodeId]);

  const renderNode = (entry: NodeEntry) => {
    const effective = effectiveNodesById.get(entry.id);
    const selected = selection.nodeId === entry.id;
    const effectiveDayDate = dayDate ?? inferredDate(entry.node.dayId);
    const state: TimelineNodeState = {
      completed: effective?.completed ?? false,
      current: entry.id === currentNodeId,
      ...(effectiveDayDate === undefined ? {} : { dayDate: effectiveDayDate }),
      position: positionById.get(entry.id) ?? "middle",
      ...(effective?.selectedCandidateId === undefined
        ? {}
        : { selectedCandidateId: effective.selectedCandidateId }),
      completedChecklistIds,
      shoppingStatuses,
      ...(selected ? { selectionSource: selection.source } : {}),
    };
    return (
      <TimelineEntry
        node={entry.node}
        state={state}
        selected={selected}
        onSelect={() => onNodeSelect(entry.id)}
        Renderer={rendererFor(entry.node)}
      />
    );
  };

  return (
    <ol className="itinerary-timeline" aria-label="Day itinerary">
      {entries.map((entry) => {
        if (entry.kind === "route") {
          const destination = effectiveNodesById.get(entry.route.edge.toNodeId);
          return (
            <li key={entry.id} className="itinerary-timeline__entry itinerary-timeline__route">
              <RouteConnector
                route={entry.route}
                state={routeStates[entry.id]}
                destinationTiming={destination?.node.timing}
                onRouteSelect={onRouteSelect}
                onRetry={onRouteRetry}
                navigationHref={routeNavigationHrefs[entry.id]}
                reducedMotion={reducedMotion}
              />
            </li>
          );
        }

        if (entry.kind === "logistics-group") {
          return (
            <li
              key={entry.id}
              className="itinerary-timeline__entry"
              data-logistics-group={entry.id}
            >
              <section aria-label="Logistics steps">
                <ol className="itinerary-timeline">
                  {entry.entries.map((child) => (
                    <li
                      key={child.id}
                      className="itinerary-timeline__entry"
                      ref={(element) => {
                        if (element === null) {
                          nodeElementsRef.current.delete(child.id);
                        } else {
                          nodeElementsRef.current.set(child.id, element);
                        }
                      }}
                    >
                      {renderNode(child)}
                    </li>
                  ))}
                </ol>
              </section>
            </li>
          );
        }

        return (
          <li
            key={entry.id}
            ref={(element) => {
              if (element === null) {
                nodeElementsRef.current.delete(entry.id);
              } else {
                nodeElementsRef.current.set(entry.id, element);
              }
            }}
            className="itinerary-timeline__entry"
          >
            {renderNode(entry)}
          </li>
        );
      })}
    </ol>
  );
}
