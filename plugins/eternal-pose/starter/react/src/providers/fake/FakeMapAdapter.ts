import type { Coordinates } from "@laugh-tale-island/core";
import type { MapFocusTarget, MapPadding, MapPresentation } from "@laugh-tale-island/core";
import type { MapAdapter, MapEvents } from "@laugh-tale-island/core/browser";

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

export class FakeMapAdapter implements MapAdapter {
  readonly mountCalls: HTMLElement[] = [];
  readonly renderCalls: MapPresentation[] = [];
  readonly focusCalls: MapFocusTarget[] = [];
  readonly fitCalls: string[][] = [];
  readonly paddingCalls: MapPadding[] = [];
  readonly userLocationCalls: (Coordinates | null)[] = [];
  destroyCalls = 0;

  private events: MapEvents | null = null;

  mount(element: HTMLElement, events: MapEvents): Promise<void> {
    this.mountCalls.push(element);
    this.events = events;
    return Promise.resolve();
  }

  render(presentation: MapPresentation): void {
    this.renderCalls.push(clonePresentation(presentation));
  }

  focus(target: MapFocusTarget): void {
    this.focusCalls.push({ ...target });
  }

  fit(ids: string[]): void {
    this.fitCalls.push([...ids]);
  }

  setPadding(padding: MapPadding): void {
    this.paddingCalls.push({ ...padding });
  }

  setUserLocation(location: Coordinates | null): void {
    this.userLocationCalls.push(location === null ? null : { ...location });
  }

  destroy(): void {
    this.destroyCalls += 1;
    this.events = null;
  }

  emitPlaceSelect(placeOwnerId: string): void {
    this.events?.onPlaceSelect(placeOwnerId);
  }

  emitRouteSelect(routeId: string): void {
    this.events?.onRouteSelect(routeId);
  }
}
