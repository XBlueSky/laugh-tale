import type { Coordinates } from "@laugh-tale-island/core";
import {
  USER_LOCATION_OWNER_ID,
  type MapFocusTarget,
  type MapPadding,
  type MapPresentation,
} from "@laugh-tale-island/core";
import { type MapAdapter, type MapEvents } from "@laugh-tale-island/core/browser";
import type {
  MapMarkerVisual,
  MapRouteVisual,
  MapVisualProfile,
} from "../../controllers/presentation-contract";
import {
  resolveMapFallbackPaint,
  SAFE_MAP_FALLBACK_PAINT,
} from "../../controllers/map-fallback-paint";
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

function markerContent(visual: MapMarkerVisual): HTMLElement {
  const content = document.createElement("span");
  content.className = visual.className;
  content.setAttribute("aria-hidden", "true");
  for (const part of visual.parts) {
    const element = document.createElement("span");
    element.className = part.className;
    element.textContent = part.text;
    content.append(element);
  }
  return content;
}

function escapeXmlAttribute(value: string): string {
  const escapes: Readonly<Record<string, string>> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  };
  return value.replace(/[&<>"']/g, (character) => escapes[character] ?? character);
}

function classicMarkerIcon(visual: MapMarkerVisual): string {
  const fill = escapeXmlAttribute(
    resolveMapFallbackPaint(visual.fallback.fill) ?? SAFE_MAP_FALLBACK_PAINT,
  );
  const stroke = escapeXmlAttribute(
    resolveMapFallbackPaint(visual.fallback.stroke) ?? SAFE_MAP_FALLBACK_PAINT,
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="${fill}" stroke="${stroke}" stroke-width="3"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function supportedDashIcons(
  visual: MapRouteVisual,
): google.maps.IconSequence[] | undefined {
  if (visual.dash?.length !== 2) {
    return undefined;
  }
  const [dashLength, gapLength] = visual.dash;
  if (
    dashLength === undefined ||
    gapLength === undefined ||
    !Number.isFinite(dashLength) ||
    !Number.isFinite(gapLength) ||
    dashLength <= 0 ||
    gapLength <= 0
  ) {
    return undefined;
  }
  return [
    {
      icon: {
        path: `M 0,0 0,${dashLength}`,
        strokeColor: visual.stroke,
        strokeOpacity: visual.opacity,
        strokeWeight: visual.width,
      },
      offset: "0",
      repeat: `${dashLength + gapLength}px`,
    },
  ];
}

export interface GoogleMapAdapterOptions {
  development: boolean;
  mapId?: string;
  profile: MapVisualProfile;
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
  private readonly advancedMarkers: google.maps.marker.AdvancedMarkerElement[] = [];
  private readonly classicMarkers: google.maps.Marker[] = [];
  private readonly polylines: google.maps.Polyline[] = [];
  private readonly markerListeners: Array<{
    marker: google.maps.marker.AdvancedMarkerElement;
    listener: EventListener;
  }> = [];
  private readonly mapListeners: google.maps.MapsEventListener[] = [];
  private readonly placeCoordinatesByOwnerId = new Map<string, Coordinates[]>();
  private readonly routeCoordinatesById = new Map<string, Coordinates[]>();
  private userAdvancedMarker: google.maps.marker.AdvancedMarkerElement | null = null;
  private userClassicMarker: google.maps.Marker | null = null;
  private userLocation: Coordinates | null = null;
  private padding: MapPadding = { ...DEFAULT_PADDING };
  private lifecycleGeneration = 0;
  private renderGeneration = 0;

  private readonly mapId: string | undefined;

  constructor(
    private readonly runtime: GoogleMapsRuntime,
    private readonly options: GoogleMapAdapterOptions,
  ) {
    const configuredMapId = options.mapId?.trim() ?? "";
    this.mapId =
      configuredMapId.length > 0
        ? configuredMapId
        : options.development
          ? runtime.Map.DEMO_MAP_ID
          : undefined;
  }

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
      ...(this.mapId === undefined ? {} : { mapId: this.mapId }),
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
    const coordinates =
      target.kind === "place"
        ? this.placeCoordinatesByOwnerId.get(target.id)
        : this.routeCoordinatesById.get(target.id);
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
    const coordinates = ids.flatMap((id) => [
      ...(this.placeCoordinatesByOwnerId.get(id) ?? []),
      ...(this.routeCoordinatesById.get(id) ?? []),
    ]).map((point) => ({ ...point }));
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

    for (const [index, place] of presentation.places.entries()) {
      const coordinates = normalizeProviderLocation(place.coordinates);
      if (coordinates === undefined) {
        continue;
      }
      const visual = this.options.profile.marker(place, index);
      if (this.mapId === undefined) {
        const marker = new this.runtime.Marker({
          map,
          position: coordinates,
          title: visual.title,
          icon: classicMarkerIcon(visual),
          ...(visual.fallback.text.length === 0
            ? {}
            : { label: visual.fallback.text }),
        });
        const listener = marker.addListener("click", () => {
          if (
            lifecycleGeneration === this.lifecycleGeneration &&
            renderGeneration === this.renderGeneration
          ) {
            this.events?.onPlaceSelect(place.ownerId);
          }
        });
        this.classicMarkers.push(marker);
        this.mapListeners.push(listener);
      } else {
        const marker = new this.runtime.AdvancedMarkerElement({
          map,
          position: coordinates,
          title: visual.title,
          content: markerContent(visual),
          gmpClickable: true,
        });
        marker.setAttribute("aria-label", visual.label);
        const listener: EventListener = () => {
          if (
            lifecycleGeneration === this.lifecycleGeneration &&
            renderGeneration === this.renderGeneration
          ) {
            this.events?.onPlaceSelect(place.ownerId);
          }
        };
        marker.addEventListener("gmp-click", listener);
        this.advancedMarkers.push(marker);
        this.markerListeners.push({ marker, listener });
      }
      this.placeCoordinatesByOwnerId.set(place.ownerId, [{ ...coordinates }]);
    }

    for (const route of presentation.routes) {
      if (route.tone === "unavailable") {
        continue;
      }
      const path: Coordinates[] = [];
      let invalidPath = false;
      for (const point of route.path) {
        const normalized = normalizeProviderLocation(point);
        if (normalized === undefined) {
          invalidPath = true;
          break;
        }
        path.push(normalized);
      }
      if (invalidPath || path.length < 2) {
        continue;
      }
      const visual = this.options.profile.route(route);
      if (
        visual.casing !== undefined &&
        visual.casing.width > visual.width
      ) {
        const casing = new this.runtime.Polyline({
          map,
          path,
          clickable: false,
          strokeColor: visual.casing.stroke,
          strokeOpacity: visual.casing.opacity,
          strokeWeight: visual.casing.width,
        });
        this.polylines.push(casing);
      }
      const icons = supportedDashIcons(visual);
      const polyline = new this.runtime.Polyline({
        map,
        path,
        clickable: true,
        strokeColor: visual.stroke,
        strokeOpacity: icons === undefined ? visual.opacity : 0,
        strokeWeight: visual.width,
        ...(icons === undefined ? {} : { icons }),
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
      this.mapListeners.push(listener);
      this.routeCoordinatesById.set(
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
    const visual = this.options.profile.userLocation();
    if (this.mapId === undefined) {
      this.userClassicMarker = new this.runtime.Marker({
        map: this.map,
        position: this.userLocation,
        title: visual.title,
        icon: classicMarkerIcon(visual),
        ...(visual.fallback.text.length === 0
          ? {}
          : { label: visual.fallback.text }),
      });
    } else {
      this.userAdvancedMarker = new this.runtime.AdvancedMarkerElement({
        map: this.map,
        position: this.userLocation,
        title: visual.title,
        content: markerContent(visual),
      });
      this.userAdvancedMarker.setAttribute("aria-label", visual.label);
    }
    this.placeCoordinatesByOwnerId.set(USER_LOCATION_OWNER_ID, [
      { ...this.userLocation },
    ]);
  }

  private clearPresentation(): void {
    for (const { marker, listener } of this.markerListeners.splice(0)) {
      marker.removeEventListener("gmp-click", listener);
    }
    for (const listener of this.mapListeners.splice(0)) {
      listener.remove();
    }
    for (const marker of this.advancedMarkers.splice(0)) {
      marker.map = null;
    }
    for (const marker of this.classicMarkers.splice(0)) {
      marker.setMap(null);
    }
    for (const polyline of this.polylines.splice(0)) {
      polyline.setMap(null);
    }
    this.placeCoordinatesByOwnerId.clear();
    this.routeCoordinatesById.clear();
    if (this.userLocation !== null) {
      this.placeCoordinatesByOwnerId.set(USER_LOCATION_OWNER_ID, [
        { ...this.userLocation },
      ]);
    }
  }

  private clearUserMarker(): void {
    this.placeCoordinatesByOwnerId.delete(USER_LOCATION_OWNER_ID);
    if (this.userAdvancedMarker !== null) {
      this.userAdvancedMarker.map = null;
      this.userAdvancedMarker = null;
    }
    if (this.userClassicMarker !== null) {
      this.userClassicMarker.setMap(null);
      this.userClassicMarker = null;
    }
  }

  private releaseMap(): void {
    this.clearPresentation();
    this.clearUserMarker();
    this.map?.unbindAll();
    this.map = null;
  }
}
