import { useEffect, useMemo, useRef } from "react";

import type { RouteEdge, ShoppingStatus } from "@laugh-tale/core";
import type { EffectiveDay, EffectiveNode, EffectiveTrip } from "@laugh-tale/core";
import type { TripSelection } from "@laugh-tale/react";
import type { NavigationAdapter } from "@laugh-tale/core/browser";
import { rendererFor } from "./renderers/CustomEntry";
import { RouteConnector, type RouteConnectorState } from "./timeline/RouteConnector";
import { TimelineEntry, type TimelineNodeState } from "./timeline/TimelineEntry";
import { buildTimelineEntries, type NodeEntry } from "@laugh-tale/core";

export interface ItineraryTimelineProps {
  nodes: readonly EffectiveNode[];
  routes: readonly RouteEdge[];
  selection: TripSelection;
  onNodeSelect: (nodeId: string) => void;
  routeStates?: Readonly<Record<string, RouteConnectorState>>;
  navigationAdapter?: NavigationAdapter;
  onRouteSelect?: (routeId: string) => void;
  onRouteRetry?: (routeId: string) => void;
  dayDate?: string;
  completedChecklistIds?: ReadonlySet<string>;
  shoppingStatuses?: Readonly<Record<string, ShoppingStatus>>;
  reducedMotion?: boolean;
  currentNodeId?: string | null;
  selectedRouteId?: string | null;
  routeSelectionSource?: "list" | "map" | null;
  routeSelectionRequestId?: number;
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
        date: dayDate ?? "",
        title: "Day itinerary",
        nodes: nodes.map(({ node }) => node),
      },
      nodes: [...nodes],
    },
    trip: { routes: [...routes] },
  };
}

function buildNavigationHrefs(
  entries: readonly ReturnType<typeof buildTimelineEntries>[number][],
  adapter: NavigationAdapter | undefined,
): Map<string, string> {
  const hrefs = new Map<string, string>();
  if (adapter === undefined) {
    return hrefs;
  }
  for (const entry of entries) {
    if (entry.kind !== "route") {
      continue;
    }
    const { mode, navigation } = entry.route.edge;
    if (navigation === undefined || mode === "flight") {
      continue;
    }
    const origin = navigation.origin.trim();
    const destination = navigation.destination.trim();
    if (origin.length === 0 || destination.length === 0) {
      continue;
    }
    try {
      hrefs.set(entry.id, adapter.directions({
        origin,
        destination,
        travelMode: mode,
      }));
    } catch {
      // External navigation is optional; a faulty adapter cannot hide the itinerary.
    }
  }
  return hrefs;
}

export function ItineraryTimeline({
  nodes,
  routes,
  selection,
  onNodeSelect,
  routeStates = {},
  navigationAdapter,
  onRouteSelect,
  onRouteRetry,
  dayDate,
  completedChecklistIds = new Set<string>(),
  shoppingStatuses = {},
  reducedMotion,
  currentNodeId = null,
  selectedRouteId = null,
  routeSelectionSource = null,
  routeSelectionRequestId = 0,
}: ItineraryTimelineProps) {
  const nodeElementsRef = useRef(new Map<string, HTMLLIElement>());
  const routeElementsRef = useRef(new Map<string, HTMLButtonElement>());
  const timelineProjection = useMemo(
    () => projection(nodes, routes, dayDate),
    [dayDate, nodes, routes],
  );
  const entries = useMemo(
    () => buildTimelineEntries(timelineProjection.day, timelineProjection.trip),
    [timelineProjection],
  );
  const routeStatesById = useMemo(
    () => new Map(Object.entries(routeStates)),
    [routeStates],
  );
  const navigationHrefsById = useMemo(
    () => buildNavigationHrefs(entries, navigationAdapter),
    [entries, navigationAdapter],
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

  useEffect(() => {
    if (selectedRouteId === null || routeSelectionSource !== "map") return;
    const routeElement = routeElementsRef.current.get(selectedRouteId);
    routeElement?.scrollIntoView?.({ block: "nearest" });
    routeElement?.focus({ preventScroll: true });
  }, [routeSelectionRequestId, routeSelectionSource, selectedRouteId]);

  const renderNode = (entry: NodeEntry) => {
    const effective = effectiveNodesById.get(entry.id);
    const selected = selection.nodeId === entry.id;
    const state: TimelineNodeState = {
      completed: effective?.completed ?? false,
      current: entry.id === currentNodeId,
      ...(dayDate === undefined ? {} : { dayDate }),
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
            <li key={`route:${entry.id}`} className="itinerary-timeline__entry itinerary-timeline__route">
              <RouteConnector
                route={entry.route}
                state={routeStatesById.get(entry.id)}
                selected={selectedRouteId === entry.id}
                controlRef={(element) => {
                  if (element === null) routeElementsRef.current.delete(entry.id);
                  else routeElementsRef.current.set(entry.id, element);
                }}
                destinationTiming={destination?.node.timing}
                onRouteSelect={onRouteSelect}
                onRetry={onRouteRetry}
                navigationHref={navigationHrefsById.get(entry.id)}
                reducedMotion={reducedMotion}
              />
            </li>
          );
        }

        if (entry.kind === "logistics-group") {
          return (
            <li
              key={`logistics-group:${entry.id}`}
              className="itinerary-timeline__entry"
              data-logistics-group={entry.id}
            >
              <section aria-label="Logistics steps">
                <ol className="itinerary-timeline">
                  {entry.entries.map((child) => (
                    <li
                      key={`node:${child.id}`}
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
            key={`node:${entry.id}`}
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
