import type { PlaceRef, RouteEdge, Trip, TripNode } from "@laugh-tale-island/core";

import resolvedJson from "./resolved-places.json";
import sourceJson from "./source/tokyo-itinerary.json";
import {
  asResolvedPlaces,
  assertSourceItinerary,
  type ResolvedPlaces,
  type SourceDay,
  type SourceItinerary,
  type SourceStop,
} from "./source/types";

function nodeId(day: SourceDay, index: number, stop: SourceStop): string {
  return `${day.id}-s${String(index + 1).padStart(2, "0")}-${stop.slug}`;
}

function placeFor(title: string, resolved: ResolvedPlaces): PlaceRef {
  const record = resolved[title];
  if (record?.status === "resolved") {
    return {
      name: title,
      coordinates: { lat: record.lat, lng: record.lng },
      provider: { name: "google", placeId: record.placeId },
      certainty: "suggested",
    };
  }
  return { name: title, certainty: "unverified" };
}

function toNode(day: SourceDay, index: number, stop: SourceStop, resolved: ResolvedPlaces): TripNode {
  const base = {
    id: nodeId(day, index, stop),
    dayId: day.id,
    title: stop.title,
    timing: { certainty: "unknown" as const },
    optionality: "core" as const,
    place: placeFor(stop.title, resolved),
  };
  switch (stop.kind) {
    case "transfer":
      return { ...base, kind: "transfer", payload: { mode: "flight", terminal: "T2" } };
    case "lodging":
      return { ...base, kind: "lodging", payload: { role: "base" } };
    case "dining":
      return { ...base, kind: "dining", payload: {} };
    case "shopping":
      return { ...base, kind: "shopping", payload: { items: [] } };
    case "sightseeing":
      return { ...base, kind: "sightseeing", payload: {} };
    case "experience":
      return { ...base, kind: "experience", payload: {} };
  }
}

function toRoutes(day: SourceDay, nodes: TripNode[]): RouteEdge[] {
  if (day.legs.length !== nodes.length - 1) {
    throw new Error(`${day.id}: expected ${nodes.length - 1} legs, got ${day.legs.length}`);
  }
  return day.legs.flatMap((mode, index) => {
    if (mode === "unknown") return [];
    const from = nodes[index];
    const to = nodes[index + 1];
    return [
      {
        id: `leg:${day.id}-${String(index + 1).padStart(2, "0")}`,
        dayId: day.id,
        fromNodeId: from.id,
        toNodeId: to.id,
        mode,
        source: "manual" as const,
        certainty: "confirmed" as const,
        navigation: { origin: from.title, destination: to.title },
      },
    ];
  });
}

export function buildTokyoTrip(source: SourceItinerary, resolved: ResolvedPlaces): Trip {
  const days = source.days.map((day) => ({
    id: day.id,
    date: day.date,
    title: day.title,
    nodes: day.stops.map((stop, index) => toNode(day, index, stop, resolved)),
  }));
  const routes = source.days.flatMap((day, index) => toRoutes(day, days[index].nodes));
  return {
    id: "tokyo-2026-08",
    title: source.title,
    timezone: source.timezone,
    startDate: source.startDate,
    endDate: source.endDate,
    days,
    routes,
    candidateGroups: [],
    reservations: [],
    tasks: [],
  };
}

export const tokyoTrip: Trip = buildTokyoTrip(
  assertSourceItinerary(sourceJson),
  asResolvedPlaces(resolvedJson),
);
