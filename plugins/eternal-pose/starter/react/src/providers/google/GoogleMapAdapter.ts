import type { Coordinates } from "../../trip-core/model";
import {
  USER_LOCATION_OWNER_ID,
  type MapAdapter,
  type MapEvents,
  type MapFocusTarget,
  type MapPadding,
  type MapPlacePresentation,
  type MapPresentation,
} from "../../experience-shell/provider-contracts";
import type { GoogleMapsRuntime } from "./google-config";
import { normalizeProviderLocation } from "./provider-location";

const DEFAULT_PADDING: MapPadding = { top: 0, right: 0, bottom: 0, left: 0 };

function clonePresentation(presentation: MapPresentation): MapPresentation {
  return {
    places: presentation.places.map((place) => ({
      ...place,
      coordinates: { ...place.coordinates },
    })),
    routes: presentation.routes.map((route) => ({
      ...route,
      path: route.path.map((point) => ({ ...point })),
    })),
    ...(presentation.selectedPlaceOwnerId === undefined
      ? {}
      : { selectedPlaceOwnerId: presentation.selectedPlaceOwnerId }),
    ...(presentation.selectedRouteId === undefined
      ? {}
      : { selectedRouteId: presentation.selectedRouteId }),
  };
}

function markerName(place: MapPlacePresentation): string {
  switch (place.tone) {
    case "candidate":
      return `Candidate: ${place.label}`;
    case "selected":
      return `Selected: ${place.label}`;
    case "completed":
      return `Completed: ${place.label}`;
    case "skipped":
      return `Skipped: ${place.label}`;
    default:
      return place.label;
  }
}

function markerContent(place: MapPlacePresentation): HTMLElement {
  const content = document.createElement("span");
  content.className = "map-marker";
  content.dataset.tone = place.tone;
  content.setAttribute("aria-hidden", "true");
  content.textContent = place.label;
  return content;
}

function boundsFor(
  coordinates: readonly Coordinates[],
): google.maps.LatLngBoundsLiteral | undefined {
  if (coordinates.length === 0) {
    return undefined;
  }
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  for (const coordinate of coordinates) {
    north = Math.max(north, coordinate.lat);
    south = Math.min(south, coordinate.lat);
    east = Math.max(east, coordinate.lng);
    west = Math.min(west, coordinate.lng);
  }
  return { north, south, east, west };
}

export class GoogleMapAdapter implements MapAdapter {
  private map: google.maps.Map | null = null;
  private events: MapEvents | null = null;
  private pendingPresentation: MapPresentation | null = null;
  private readonly markers: google.maps.marker.AdvancedMarkerElement[] = [];
  private readonly polylines: google.maps.Polyline[] = [];
  private readonly listeners: google.maps.MapsEventListener[] = [];
  private readonly coordinatesById = new Map<string, Coordinates[]>();
  private userMarker: google.maps.marker.AdvancedMarkerElement | null = null;
  private userLocation: Coordinates | null = null;
  private padding: MapPadding = { ...DEFAULT_PADDING };
  private lifecycleGeneration = 0;
  private renderGeneration = 0;

  constructor(private readonly runtime: GoogleMapsRuntime) {}

  async mount(element: HTMLElement, events: MapEvents): Promise<void> {
    const generation = ++this.lifecycleGeneration;
    this.releaseMap();
    this.events = events;

    await Promise.resolve();
    if (generation !== this.lifecycleGeneration) {
      return;
    }

    this.map = new this.runtime.Map(element, {
      center: { lat: 0, lng: 0 },
      zoom: 2,
      mapId: this.runtime.Map.DEMO_MAP_ID,
    });
    if (this.userLocation !== null) {
      this.createUserMarker();
    }
    if (this.pendingPresentation !== null) {
      this.renderNow(
        this.pendingPresentation,
        generation,
        this.renderGeneration,
      );
    }
  }

  render(presentation: MapPresentation): void {
    this.pendingPresentation = clonePresentation(presentation);
    const generation = ++this.renderGeneration;
    if (this.map !== null) {
      this.renderNow(
        this.pendingPresentation,
        this.lifecycleGeneration,
        generation,
      );
    }
  }

  focus(target: MapFocusTarget): void {
    const coordinates = this.coordinatesById.get(target.id);
    if (this.map === null || coordinates === undefined || coordinates.length === 0) {
      return;
    }
    if (target.kind === "place" || coordinates.length === 1) {
      this.map.panTo(coordinates[0]);
      return;
    }
    this.fitCoordinates(coordinates);
  }

  fit(ids: string[]): void {
    const coordinates = ids.flatMap(
      (id) => this.coordinatesById.get(id)?.map((point) => ({ ...point })) ?? [],
    );
    if (coordinates.length === 1) {
      this.map?.panTo(coordinates[0]);
    } else {
      this.fitCoordinates(coordinates);
    }
  }

  setPadding(padding: MapPadding): void {
    this.padding = { ...padding };
  }

  setUserLocation(location: Coordinates | null): void {
    this.userLocation =
      location === null ? null : normalizeProviderLocation(location) ?? null;
    this.clearUserMarker();
    if (this.map !== null && this.userLocation !== null) {
      this.createUserMarker();
    }
  }

  destroy(): void {
    this.lifecycleGeneration += 1;
    this.renderGeneration += 1;
    this.pendingPresentation = null;
    this.userLocation = null;
    this.releaseMap();
    this.events = null;
  }

  private renderNow(
    presentation: MapPresentation,
    lifecycleGeneration: number,
    renderGeneration: number,
  ): void {
    const map = this.map;
    if (
      map === null ||
      lifecycleGeneration !== this.lifecycleGeneration ||
      renderGeneration !== this.renderGeneration
    ) {
      return;
    }
    this.clearPresentation();

    for (const place of presentation.places) {
      const coordinates = normalizeProviderLocation(place.coordinates);
      if (coordinates === undefined) {
        continue;
      }
      const name = markerName(place);
      const marker = new this.runtime.AdvancedMarkerElement({
        map,
        position: coordinates,
        title: name,
        content: markerContent(place),
        gmpClickable: true,
      });
      const listener = marker.addListener("gmp-click", () => {
        if (
          lifecycleGeneration === this.lifecycleGeneration &&
          renderGeneration === this.renderGeneration
        ) {
          this.events?.onPlaceSelect(place.ownerId);
        }
      });
      this.markers.push(marker);
      this.listeners.push(listener);
      this.coordinatesById.set(place.ownerId, [{ ...coordinates }]);
    }

    for (const route of presentation.routes) {
      if (route.tone === "unavailable") {
        continue;
      }
      const path = route.path.flatMap((point) => {
        const normalized = normalizeProviderLocation(point);
        return normalized === undefined ? [] : [normalized];
      });
      if (path.length < 2) {
        continue;
      }
      const polyline = new this.runtime.Polyline({
        map,
        path,
        clickable: true,
        strokeColor: route.tone === "selected" ? "#155eef" : "#4b5563",
        strokeOpacity: 0.9,
        strokeWeight: route.tone === "selected" ? 6 : 4,
      });
      const listener = polyline.addListener("click", () => {
        if (
          lifecycleGeneration === this.lifecycleGeneration &&
          renderGeneration === this.renderGeneration
        ) {
          this.events?.onRouteSelect(route.edgeId);
        }
      });
      this.polylines.push(polyline);
      this.listeners.push(listener);
      this.coordinatesById.set(
        route.edgeId,
        path.map((point) => ({ ...point })),
      );
    }
  }

  private fitCoordinates(coordinates: readonly Coordinates[]): void {
    const bounds = boundsFor(coordinates);
    if (this.map !== null && bounds !== undefined) {
      this.map.fitBounds(bounds, { ...this.padding });
    }
  }

  private createUserMarker(): void {
    if (this.map === null || this.userLocation === null) {
      return;
    }
    const content = document.createElement("span");
    content.className = "map-marker map-marker--user";
    content.setAttribute("aria-hidden", "true");
    this.userMarker = new this.runtime.AdvancedMarkerElement({
      map: this.map,
      position: this.userLocation,
      title: "Your location",
      content,
    });
    this.coordinatesById.set(USER_LOCATION_OWNER_ID, [
      { ...this.userLocation },
    ]);
  }

  private clearPresentation(): void {
    for (const listener of this.listeners.splice(0)) {
      listener.remove();
    }
    for (const marker of this.markers.splice(0)) {
      marker.map = null;
    }
    for (const polyline of this.polylines.splice(0)) {
      polyline.setMap(null);
    }
    this.coordinatesById.clear();
    if (this.userLocation !== null) {
      this.coordinatesById.set(USER_LOCATION_OWNER_ID, [
        { ...this.userLocation },
      ]);
    }
  }

  private clearUserMarker(): void {
    this.coordinatesById.delete(USER_LOCATION_OWNER_ID);
    if (this.userMarker !== null) {
      this.userMarker.map = null;
      this.userMarker = null;
    }
  }

  private releaseMap(): void {
    this.clearPresentation();
    this.clearUserMarker();
    this.map?.unbindAll();
    this.map = null;
  }
}
