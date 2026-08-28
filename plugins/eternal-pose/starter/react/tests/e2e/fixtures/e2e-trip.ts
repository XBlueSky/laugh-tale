import type { MapFocusTarget, MapPadding, MapPresentation, RouteRequest, RouteResult } from "@laugh-tale-island/core";
import type { MapAdapter, MapEvents, RouteAdapter } from "@laugh-tale-island/core/browser";
import type { Coordinates, RouteEdge, Trip, TripNode } from "@laugh-tale-island/core";

declare global {
  interface Window {
    __ETERNAL_POSE_E2E_NOW__?: string;
  }
}

const point = (lat: number, lng: number): Coordinates => ({ lat, lng });

const dayOneNodes: TripNode[] = [
  {
    id: "lodging-start",
    dayId: "day-one",
    kind: "lodging",
    title: "Harbor House departure",
    timing: { start: "06:30", certainty: "fixed" },
    optionality: "core",
    place: { name: "Harbor House", coordinates: point(35.6801, 139.7601), certainty: "confirmed" },
    payload: { role: "base" },
  },
  {
    id: "transport-shuttle",
    dayId: "day-one",
    kind: "transport",
    title: "Morning harbor shuttle",
    timing: { start: "07:00", certainty: "suggested" },
    optionality: "core",
    place: { name: "Harbor shuttle stop", coordinates: point(35.681, 139.761), certainty: "suggested" },
    payload: { mode: "transit", plan: "Board the blue local shuttle" },
  },
  {
    id: "transfer-ferry",
    dayId: "day-one",
    kind: "transfer",
    title: "Reserved island ferry",
    timing: { start: "08:00", end: "08:40", certainty: "fixed" },
    optionality: "core",
    place: { name: "Ferry terminal", coordinates: point(35.682, 139.762), certainty: "confirmed" },
    booking: {
      status: "confirmed",
      reference: "SYNTHETIC-FERRY",
      url: "https://example.com/synthetic-ferry",
      arrivalBufferMinutes: 20,
    },
    payload: { mode: "bus", terminal: "Pier One" },
  },
  {
    id: "sightseeing-lookout",
    dayId: "day-one",
    kind: "sightseeing",
    title: "Lookout terrace",
    timing: { start: "09:00", certainty: "suggested" },
    optionality: "core",
    place: { name: "Lookout terrace", coordinates: point(35.683, 139.763), certainty: "suggested" },
    payload: { area: "North quay" },
  },
  {
    id: "dining-lunch",
    dayId: "day-one",
    kind: "dining",
    title: "Lunch choice",
    timing: { start: "10:00", certainty: "suggested" },
    optionality: "candidate",
    payload: { cuisine: "Harbor plates", candidateGroupId: "lunch-options" },
  },
  {
    id: "shopping-supplies",
    dayId: "day-one",
    kind: "shopping",
    title: "Supply hall",
    timing: { start: "11:00", certainty: "unknown" },
    optionality: "optional",
    place: { name: "Supply hall", coordinates: point(35.686, 139.766), certainty: "candidate" },
    payload: {
      items: [
        { id: "item-notebook", title: "Pocket notebook", priority: "must", initialStatus: "pending" },
        { id: "item-postcards", title: "Postcards", priority: "nice", initialStatus: "pending" },
      ],
    },
  },
  {
    id: "lodging-midday",
    dayId: "day-one",
    kind: "lodging",
    title: "Midday hotel return",
    timing: { start: "12:00", certainty: "suggested" },
    optionality: "core",
    place: { name: "Harbor House", coordinates: point(35.6801, 139.7601), certainty: "confirmed" },
    payload: { role: "return", checklist: [{ id: "drop-bags", title: "Drop off purchases" }] },
  },
  {
    id: "experience-observatory",
    dayId: "day-one",
    kind: "experience",
    title: "Sky room session",
    timing: { start: "14:00", end: "15:00", certainty: "fixed" },
    optionality: "core",
    place: { name: "Sky room", coordinates: point(35.688, 139.768), certainty: "confirmed" },
    booking: {
      status: "confirmed",
      reference: "SYNTHETIC-SKY",
      url: "https://example.com/synthetic-sky",
      arrivalBufferMinutes: 15,
    },
    payload: { durationMinutes: 60 },
  },
  {
    id: "logistics-locker",
    dayId: "day-one",
    kind: "logistics",
    title: "Locker pickup",
    timing: { start: "16:00", certainty: "suggested" },
    optionality: "core",
    payload: {
      checklist: [
        { id: "locker-slip", title: "Show locker slip" },
        { id: "locker-count", title: "Count all bags" },
      ],
    },
  },
  {
    id: "custom-field-notes",
    dayId: "day-one",
    kind: "custom",
    title: "Exchange field notes",
    timing: { start: "17:00", certainty: "unknown" },
    optionality: "optional",
    place: { name: "Field desk", coordinates: point(35.689, 139.769), certainty: "unverified" },
    payload: {
      customKind: "field-notes",
      capabilities: { place: true, completion: true },
      data: { copies: 2, waterproof: true },
    },
  },
  {
    id: "lodging-end",
    dayId: "day-one",
    kind: "lodging",
    title: "Harbor House night return",
    timing: { start: "23:30", end: "00:15", certainty: "suggested" },
    optionality: "core",
    place: { name: "Harbor House", coordinates: point(35.6801, 139.7601), certainty: "confirmed" },
    payload: { role: "base" },
  },
];

function edge(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  mode: RouteEdge["mode"],
  durationMinutes: number,
): RouteEdge {
  const origin = dayOneNodes.find((node) => node.id === fromNodeId)?.place?.name ?? fromNodeId;
  const destination = dayOneNodes.find((node) => node.id === toNodeId)?.place?.name ?? toNodeId;
  return {
    id,
    dayId: "day-one",
    fromNodeId,
    toNodeId,
    mode,
    source: "manual",
    certainty: "suggested",
    durationMinutes,
    navigation: { origin, destination },
  };
}

const dayOneRoutes: RouteEdge[] = [
  edge("route-start-shuttle", "lodging-start", "transport-shuttle", "walking", 4),
  edge("route-shuttle-ferry", "transport-shuttle", "transfer-ferry", "transit", 18),
  edge("route-ferry-lookout", "transfer-ferry", "sightseeing-lookout", "walking", 12),
  edge("route-lookout-lunch", "sightseeing-lookout", "dining-lunch", "walking", 8),
  edge("route-lunch-shopping", "dining-lunch", "shopping-supplies", "walking", 6),
  edge("route-shopping-hotel", "shopping-supplies", "lodging-midday", "transit", 15),
  edge("route-hotel-sky", "lodging-midday", "experience-observatory", "walking", 10),
  edge("route-sky-locker", "experience-observatory", "logistics-locker", "walking", 3),
  edge("route-locker-notes", "logistics-locker", "custom-field-notes", "driving", 12),
  edge("route-notes-home", "custom-field-notes", "lodging-end", "transit", 20),
];

export const e2eTrip: Trip = {
  id: "trip-e2e-archipelago",
  title: "Synthetic Archipelago Field Trip",
  timezone: "Etc/UTC",
  startDate: "2042-04-18",
  endDate: "2042-04-21",
  days: [
    { id: "day-one", date: "2042-04-18", title: "Harbor field day", summary: "All semantic surfaces with deterministic provider data.", nodes: dayOneNodes },
    {
      id: "day-two",
      date: "2042-04-19",
      title: "Cove closing day",
      nodes: [
        {
          id: "day-two-cove",
          dayId: "day-two",
          kind: "sightseeing",
          title: "Cove walk",
          timing: { start: "09:00", certainty: "fixed" },
          optionality: "core",
          place: { name: "Cove walk", coordinates: point(35.7, 139.78), certainty: "confirmed" },
          payload: { area: "South cove" },
        },
        {
          id: "day-two-lunch",
          dayId: "day-two",
          kind: "dining",
          title: "Closing lunch",
          timing: { start: "12:00", certainty: "suggested" },
          optionality: "core",
          place: { name: "Cove kitchen", coordinates: point(35.71, 139.79), certainty: "confirmed" },
          payload: { cuisine: "Seasonal plates" },
        },
      ],
    },
    {
      id: "day-three",
      date: "2042-04-20",
      title: "Riverside museum circuit",
      nodes: [
        {
          id: "day-three-museum",
          dayId: "day-three",
          kind: "sightseeing",
          title: "Riverside museum",
          timing: { start: "10:00", certainty: "fixed" },
          optionality: "core",
          place: {
            name: "Riverside museum",
            coordinates: point(35.72, 139.8),
            certainty: "confirmed",
          },
          payload: { area: "East river" },
        },
      ],
    },
    {
      id: "day-four",
      date: "2042-04-21",
      title: "Clifftop archive survey",
      nodes: [
        {
          id: "day-four-archive",
          dayId: "day-four",
          kind: "experience",
          title: "Clifftop archive",
          timing: { start: "09:30", certainty: "fixed" },
          optionality: "core",
          place: {
            name: "Clifftop archive",
            coordinates: point(35.73, 139.81),
            certainty: "confirmed",
          },
          payload: { durationMinutes: 75 },
        },
      ],
    },
  ],
  routes: [
    ...dayOneRoutes,
    {
      id: "route-cove-lunch",
      dayId: "day-two",
      fromNodeId: "day-two-cove",
      toNodeId: "day-two-lunch",
      mode: "walking",
      source: "manual",
      certainty: "confirmed",
      durationMinutes: 14,
      navigation: { origin: "Cove walk", destination: "Cove kitchen" },
    },
  ],
  candidateGroups: [
    {
      id: "snack-options",
      parentNodeId: "sightseeing-lookout",
      mode: "browse",
      options: [
        { id: "snack-fruit", title: "Fruit window", place: { name: "Fruit window", coordinates: point(35.6832, 139.7632), certainty: "candidate" } },
        { id: "snack-bun", title: "Steam bun cart", place: { name: "Steam bun cart", coordinates: point(35.6834, 139.7634), certainty: "candidate" } },
      ],
    },
    {
      id: "lunch-options",
      parentNodeId: "dining-lunch",
      mode: "single",
      defaultOptionId: "lunch-garden",
      options: [
        {
          id: "lunch-garden",
          title: "Garden kitchen",
          place: { name: "Garden kitchen", coordinates: point(35.684, 139.764), certainty: "candidate" },
          booking: { status: "pending", url: "https://example.com/garden-kitchen" },
        },
        {
          id: "lunch-canal",
          title: "Canal counter",
          place: { name: "Canal counter", coordinates: point(35.685, 139.765), certainty: "candidate" },
          booking: { status: "none" },
        },
      ],
    },
  ],
  reservations: [
    {
      id: "reservation-sky",
      title: "Sky room admission",
      ownerId: "experience-observatory",
      booking: { status: "confirmed", reference: "SYNTHETIC-SKY", url: "https://example.com/synthetic-sky", arrivalBufferMinutes: 15 },
    },
    { id: "reservation-lunch", title: "Garden kitchen request", ownerId: "lunch-garden", booking: { status: "pending", url: "https://example.com/garden-kitchen" } },
    { id: "reservation-walk-in", title: "Cove walk-in", ownerId: "day-two-lunch", booking: { status: "none" } },
  ],
  tasks: [
    {
      id: "pretrip-documents",
      title: "Prepare offline documents",
      scope: "pretrip",
      note: "Keep one copy outside the phone.",
      children: [
        { id: "pretrip-map", title: "Save the map" },
        { id: "pretrip-bookings", title: "Save booking pages" },
      ],
    },
    {
      id: "day-one-water",
      title: "Refill water bottle",
      scope: "day",
      dayId: "day-one",
      note: "Use the lobby fountain.",
      children: [
        { id: "water-clean", title: "Rinse bottle" },
        { id: "water-fill", title: "Fill bottle" },
      ],
    },
  ],
};

function routePath(index: number): Coordinates[] {
  const start = point(35.68 + index * 0.001, 139.76 + index * 0.001);
  return [start, point(start.lat + 0.0006, start.lng + 0.0006)];
}

const routeResults = Object.fromEntries(
  e2eTrip.routes.map((route, index): [string, RouteResult] => [
    route.id,
    {
      status: "ready",
      durationMinutes: route.durationMinutes ?? 9,
      distanceMeters: 300 + index * 40,
      path: routePath(index),
      steps: route.mode === "transit"
        ? [`Walk to ${route.fromNodeId}`, "Board synthetic blue line", `Exit for ${route.toNodeId}`]
        : [`Continue from ${route.fromNodeId}`, `Arrive at ${route.toNodeId}`],
    },
  ]),
);

class E2EVisualMapAdapter implements MapAdapter {
  private element: HTMLElement | null = null;
  private events: MapEvents | null = null;
  private presentation: MapPresentation = { places: [], routes: [] };

  mount(element: HTMLElement, events: MapEvents): Promise<void> {
    this.element = element;
    this.events = events;
    element.dataset.e2eMapSurface = "true";
    element.dataset.e2eMountCount = String(Number(element.dataset.e2eMountCount ?? "0") + 1);
    this.paint();
    return Promise.resolve();
  }

  render(presentation: MapPresentation): void {
    this.presentation = {
      ...presentation,
      places: presentation.places.map((place) => ({ ...place, coordinates: { ...place.coordinates } })),
      routes: presentation.routes.map((route) => ({ ...route, path: route.path.map((location) => ({ ...location })) })),
    };
    this.paint();
  }

  focus(target: MapFocusTarget): void {
    if (this.element !== null) {
      this.element.dataset.e2eFocusKind = target.kind;
      this.element.dataset.e2eFocusId = target.id;
      this.element.dataset.e2eFocusCount = String(Number(this.element.dataset.e2eFocusCount ?? "0") + 1);
    }
  }

  fit(ids: string[]): void {
    if (this.element !== null) this.element.dataset.e2eFitIds = JSON.stringify(ids);
  }

  setPadding(padding: MapPadding): void {
    if (this.element !== null) this.element.dataset.e2ePadding = JSON.stringify(padding);
  }

  setUserLocation(location: Coordinates | null): void {
    if (this.element !== null) this.element.dataset.e2eUserLocation = JSON.stringify(location);
  }

  destroy(): void {
    this.events = null;
    this.element?.replaceChildren();
    this.element = null;
  }

  private paint(): void {
    const element = this.element;
    if (element === null) return;
    const label = document.createElement("strong");
    label.dataset.e2eMapLabel = "true";
    label.textContent = "Deterministic test map · E2E only";
    const places = document.createElement("div");
    places.dataset.e2eMapPlaces = "true";
    for (const place of this.presentation.places) {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.dataset.mapOwner = place.ownerId;
      marker.dataset.mapTone = place.tone;
      marker.setAttribute("aria-label", `Map place ${place.label}`);
      marker.textContent = place.label;
      marker.style.minBlockSize = "44px";
      marker.style.minInlineSize = "44px";
      marker.addEventListener("click", () => this.events?.onPlaceSelect(place.ownerId));
      places.append(marker);
    }
    const routes = document.createElement("div");
    routes.dataset.e2eMapRoutes = "true";
    for (const route of this.presentation.routes) {
      if (route.path.length < 2) continue;
      const routeControl = document.createElement("button");
      routeControl.type = "button";
      routeControl.dataset.mapRoute = route.edgeId;
      routeControl.dataset.mapTone = route.tone;
      routeControl.setAttribute("aria-label", `Map route ${route.edgeId}`);
      routeControl.textContent = route.edgeId;
      routeControl.style.minBlockSize = "44px";
      routeControl.style.minInlineSize = "44px";
      routeControl.addEventListener("click", () => this.events?.onRouteSelect(route.edgeId));
      routes.append(routeControl);
    }
    const providerControl = document.createElement("button");
    providerControl.type = "button";
    providerControl.dataset.e2eProviderControl = "true";
    providerControl.setAttribute("aria-label", "Provider default map control");
    providerControl.textContent = "+";
    Object.assign(providerControl.style, {
      position: "absolute",
      insetBlockStart: "0",
      insetInlineEnd: "0",
      inlineSize: "44px",
      blockSize: "44px",
    });
    const attribution = document.createElement("small");
    attribution.dataset.e2eProviderAttribution = "true";
    attribution.textContent = "Provider map attribution";
    Object.assign(attribution.style, {
      position: "absolute",
      insetInlineEnd: "0",
      insetBlockEnd: "0",
      background: "Canvas",
      color: "CanvasText",
    });
    element.replaceChildren(label, places, routes, providerControl, attribution);
  }
}

export function createE2EMapAdapter(): MapAdapter {
  return new E2EVisualMapAdapter();
}

class E2ERouteAdapter implements RouteAdapter {
  private readonly attempts = new Map<string, number>();

  load(request: RouteRequest, signal: AbortSignal): Promise<RouteResult> {
    if (signal.aborted) {
      return Promise.reject(new DOMException("Route request aborted", "AbortError"));
    }
    const attempt = (this.attempts.get(request.edge.id) ?? 0) + 1;
    this.attempts.set(request.edge.id, attempt);
    if (request.edge.id === "route-shopping-hotel" && attempt === 1) {
      return Promise.resolve({
        status: "unavailable",
        reason: "Synthetic first attempt unavailable",
      });
    }
    const result = routeResults[request.edge.id];
    if (result === undefined) {
      return Promise.resolve({ status: "unavailable", reason: "Synthetic route missing" });
    }
    return Promise.resolve(structuredClone(result));
  }
}

export function createE2ERouteAdapter(): RouteAdapter {
  return new E2ERouteAdapter();
}

export function e2eClock(): string {
  return window.__ETERNAL_POSE_E2E_NOW__ ?? "2042-04-18T10:15:00Z";
}
