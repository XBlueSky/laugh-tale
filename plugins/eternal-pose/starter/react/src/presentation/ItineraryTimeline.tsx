import { useMemo } from "react";

import {
  buildTimelineEntries,
  type EffectiveDay,
  type EffectiveNode,
  type EffectiveTrip,
  type NodeEntry,
  type RouteEdge,
  type ShoppingStatus,
} from "@laugh-tale-island/core";
import type { TripSelection } from "@laugh-tale-island/react";

import type {
  ExperienceBindings,
  ExperienceRouteViewModel,
} from "../controllers/presentation-contract";
import { rendererFor } from "./renderers/CustomEntry";
import {
  RouteConnector,
  type RouteConnectorState,
} from "./timeline/RouteConnector";
import { TimelineEntry, type TimelineNodeState } from "./timeline/TimelineEntry";

export interface ItineraryTimelineProps {
  nodes: readonly EffectiveNode[];
  routes: readonly (RouteEdge | ExperienceRouteViewModel)[];
  selection: TripSelection;
  onNodeSelect: (nodeId: string) => void;
  ownerBindings?: ExperienceBindings["owners"];
  routeStates?: Readonly<Record<string, RouteConnectorState>>;
  navigationHrefs?: Readonly<Record<string, string>>;
  onRouteSelect?: (routeId: string) => void;
  onRouteRetry?: (routeId: string) => void;
  dayDate?: string;
  completedChecklistIds?: ReadonlySet<string>;
  shoppingStatuses?: Readonly<Record<string, ShoppingStatus>>;
  reducedMotion?: boolean;
  currentNodeId?: string | null;
  selectedRouteId?: string | null;
  routeSelectionSource?: "list" | "map" | null;
}

function isRouteViewModel(
  route: RouteEdge | ExperienceRouteViewModel,
): route is ExperienceRouteViewModel {
  return "edge" in route;
}

function ownValue<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
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

export function ItineraryTimeline({
  nodes,
  routes,
  selection,
  onNodeSelect,
  ownerBindings,
  routeStates = {},
  navigationHrefs = {},
  onRouteSelect,
  onRouteRetry,
  dayDate,
  completedChecklistIds = new Set<string>(),
  shoppingStatuses = {},
  reducedMotion,
  currentNodeId = null,
  selectedRouteId = null,
  routeSelectionSource = null,
}: ItineraryTimelineProps) {
  const routeViewModels = useMemo<readonly ExperienceRouteViewModel[]>(
    () =>
      routes.map((route) =>
        isRouteViewModel(route)
          ? route
          : (() => {
              const loadState = ownValue(routeStates, route.id);
              const navigationHref = ownValue(navigationHrefs, route.id);
              return {
              edge: route,
              ...(loadState === undefined ? {} : { loadState }),
              selected: selectedRouteId === route.id,
              selectionSource:
                selectedRouteId === route.id ? routeSelectionSource : null,
              ...(navigationHref === undefined ? {} : { navigationHref }),
            };
          })(),
      ),
    [navigationHrefs, routeSelectionSource, routeStates, routes, selectedRouteId],
  );
  const edges = useMemo(
    () => routeViewModels.map(({ edge }) => edge),
    [routeViewModels],
  );
  const routeModelsById = useMemo(
    () => new Map(routeViewModels.map((route) => [route.edge.id, route])),
    [routeViewModels],
  );
  const timelineProjection = useMemo(
    () => projection(nodes, edges, dayDate),
    [dayDate, edges, nodes],
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
          const routeModel = routeModelsById.get(entry.id);
          return (
            <li
              key={`route:${entry.id}`}
              className="itinerary-timeline__entry itinerary-timeline__route"
            >
              <RouteConnector
                route={entry.route}
                state={routeModel?.loadState}
                selected={routeModel?.selected ?? false}
                controlRef={ownerBindings?.routeRef(entry.id)}
                destinationTiming={destination?.node.timing}
                onRouteSelect={onRouteSelect}
                onRetry={onRouteRetry}
                navigationHref={routeModel?.navigationHref}
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
                      ref={ownerBindings?.nodeRef(child.id)}
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
            ref={ownerBindings?.nodeRef(entry.id)}
            className="itinerary-timeline__entry"
          >
            {renderNode(entry)}
          </li>
        );
      })}
    </ol>
  );
}
