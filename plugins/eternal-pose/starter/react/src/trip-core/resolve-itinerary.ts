import type {
  Booking,
  CandidateGroup,
  CandidateOption,
  FactCertainty,
  PlaceRef,
  RouteEdge,
  Trip,
  TripDay,
  TripNode,
} from "./model";
import type { TripProgressV1 } from "./progress";
import { resolveRouteEdges } from "./routes";

export interface EffectiveNode {
  node: TripNode;
  sourceNodeId: string;
  completed: boolean;
  selectedCandidateId?: string;
}

export interface EffectiveDay {
  day: TripDay;
  nodes: EffectiveNode[];
}

export interface EffectiveTrip {
  tripId: string;
  days: EffectiveDay[];
  routes: RouteEdge[];
}

const FACT_CERTAINTIES: ReadonlySet<string> = new Set([
  "confirmed",
  "suggested",
  "candidate",
  "unverified",
]);

function isFactCertainty(value: unknown): value is FactCertainty {
  return typeof value === "string" && FACT_CERTAINTIES.has(value);
}

function sanitizePlace(place: PlaceRef | undefined): PlaceRef | undefined {
  if (place === undefined || typeof place.name !== "string" || place.name.trim().length === 0) {
    return undefined;
  }

  const coordinates = place.coordinates;
  const safeCoordinates =
    coordinates !== undefined &&
    Number.isFinite(coordinates.lat) &&
    coordinates.lat >= -90 &&
    coordinates.lat <= 90 &&
    Number.isFinite(coordinates.lng) &&
    coordinates.lng >= -180 &&
    coordinates.lng <= 180
      ? { lat: coordinates.lat, lng: coordinates.lng }
      : undefined;

  const provider = place.provider;
  const safeProvider =
    provider?.name === "google" &&
    (provider.placeId === undefined ||
      (typeof provider.placeId === "string" && provider.placeId.trim().length > 0))
      ? {
          name: "google" as const,
          ...(provider.placeId === undefined ? {} : { placeId: provider.placeId }),
        }
      : undefined;

  return {
    name: place.name,
    ...(safeCoordinates === undefined ? {} : { coordinates: safeCoordinates }),
    ...(safeProvider === undefined ? {} : { provider: safeProvider }),
    certainty: isFactCertainty(place.certainty) ? place.certainty : "unverified",
  };
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizeBooking(booking: Booking | undefined): Booking | undefined {
  if (
    booking === undefined ||
    (booking.status !== "confirmed" && booking.status !== "pending" && booking.status !== "none")
  ) {
    return undefined;
  }

  return {
    status: booking.status,
    ...(typeof booking.reference === "string" ? { reference: booking.reference } : {}),
    ...(typeof booking.url === "string" && isHttpsUrl(booking.url) ? { url: booking.url } : {}),
    ...(Number.isInteger(booking.arrivalBufferMinutes) &&
    (booking.arrivalBufferMinutes ?? -1) >= 0
      ? { arrivalBufferMinutes: booking.arrivalBufferMinutes }
      : {}),
  };
}

function candidateForNode(
  node: TripNode,
  candidateGroups: readonly CandidateGroup[],
  selectedCandidateIds: Readonly<Record<string, string>>,
): { group: CandidateGroup; option: CandidateOption } | undefined {
  const group = candidateGroups.find((candidate) => candidate.parentNodeId === node.id);
  if (group === undefined) {
    return undefined;
  }

  const selectedId = selectedCandidateIds[group.id] ?? group.defaultOptionId;
  if (selectedId === undefined) {
    return undefined;
  }
  const option = group.options.find((candidate) => candidate.id === selectedId);
  return option === undefined ? undefined : { group, option };
}

function resolveNode(
  node: TripNode,
  candidateGroups: readonly CandidateGroup[],
  progress: TripProgressV1,
): EffectiveNode {
  const selected = candidateForNode(node, candidateGroups, progress.selectedCandidateIds);
  if (selected === undefined) {
    return {
      node,
      sourceNodeId: node.id,
      completed: progress.completedIds.includes(node.id),
    };
  }

  const selectedPlace = sanitizePlace(selected.option.place) ?? sanitizePlace(node.place);
  const selectedBooking = sanitizeBooking(selected.option.booking ?? node.booking);

  return {
    node: {
      ...node,
      title: selected.option.title,
      place: selectedPlace,
      booking: selectedBooking,
    },
    sourceNodeId: node.id,
    completed: progress.completedIds.includes(node.id),
    selectedCandidateId: selected.option.id,
  };
}

export function resolveEffectiveItinerary(trip: Trip, progress: TripProgressV1): EffectiveTrip {
  const skippedNodeIds = new Set(progress.skippedNodeIds);
  const days: EffectiveDay[] = trip.days.map((day) => ({
    day,
    nodes: day.nodes
      .filter((node) => !(node.optionality === "optional" && skippedNodeIds.has(node.id)))
      .map((node) => resolveNode(node, trip.candidateGroups, progress)),
  }));

  const routes = days.flatMap(({ day, nodes }) => resolveRouteEdges(day, trip.routes, nodes));

  return { tripId: trip.id, days, routes };
}
