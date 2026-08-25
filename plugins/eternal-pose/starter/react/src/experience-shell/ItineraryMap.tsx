import { useEffect, useRef, useState } from "react";

import type {
  MapAdapter,
  MapPadding,
  MapPresentation,
} from "./provider-contracts";

export interface ItineraryMapProps {
  adapter: MapAdapter;
  presentation: MapPresentation;
  padding: MapPadding;
  onPlaceSelect: (ownerId: string) => void;
  onRouteSelect: (routeId: string) => void;
  onReady?: (adapter: MapAdapter) => void;
  onPresentationRendered?: (
    adapter: MapAdapter,
    presentation: MapPresentation,
  ) => void;
}

type MapMountStatus = "mounting" | "ready" | "error";

export function ItineraryMap({
  adapter,
  presentation,
  padding,
  onPlaceSelect,
  onRouteSelect,
  onReady,
  onPresentationRendered,
}: ItineraryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(false);
  const presentationRef = useRef(presentation);
  const paddingRef = useRef(padding);
  const onPlaceSelectRef = useRef(onPlaceSelect);
  const onRouteSelectRef = useRef(onRouteSelect);
  const onReadyRef = useRef(onReady);
  const onPresentationRenderedRef = useRef(onPresentationRendered);
  const [status, setStatus] = useState<MapMountStatus>("mounting");
  const [mountAttempt, setMountAttempt] = useState(0);

  useEffect(() => {
    presentationRef.current = presentation;
    paddingRef.current = padding;
    onPlaceSelectRef.current = onPlaceSelect;
    onRouteSelectRef.current = onRouteSelect;
    onReadyRef.current = onReady;
    onPresentationRenderedRef.current = onPresentationRendered;
  }, [
    onPlaceSelect,
    onPresentationRendered,
    onReady,
    onRouteSelect,
    padding,
    presentation,
  ]);

  useEffect(() => {
    const element = containerRef.current;
    if (element === null) {
      return;
    }
    let active = true;
    let released = false;
    const releaseAdapter = (): void => {
      if (!released) {
        released = true;
        adapter.destroy();
      }
    };
    readyRef.current = false;
    setStatus("mounting");

    void adapter
      .mount(element, {
        onPlaceSelect: (ownerId) => onPlaceSelectRef.current(ownerId),
        onRouteSelect: (routeId) => onRouteSelectRef.current(routeId),
      })
      .then(() => {
        if (!active) {
          return;
        }
        readyRef.current = true;
        adapter.setPadding(paddingRef.current);
        const renderedPresentation = presentationRef.current;
        adapter.render(renderedPresentation);
        onPresentationRenderedRef.current?.(adapter, renderedPresentation);
        setStatus("ready");
        onReadyRef.current?.(adapter);
      })
      .catch(() => {
        if (active) {
          readyRef.current = false;
          releaseAdapter();
          setStatus("error");
        }
      });

    return () => {
      active = false;
      readyRef.current = false;
      releaseAdapter();
    };
  }, [adapter, mountAttempt]);

  useEffect(() => {
    if (readyRef.current) {
      adapter.render(presentation);
      onPresentationRenderedRef.current?.(adapter, presentation);
    }
  }, [adapter, presentation]);

  useEffect(() => {
    if (readyRef.current) {
      adapter.setPadding(padding);
    }
  }, [adapter, padding]);

  return (
    <>
      <div
        ref={containerRef}
        className="itinerary-map"
        data-testid="itinerary-map"
        data-map-canvas="persistent"
        data-map-status={status}
        role="region"
        aria-label="Trip map"
      />
      {status === "error" ? (
        <div className="map-degraded-state" role="alert">
          <span>Map unavailable. The itinerary remains available.</span>
          <button
            type="button"
            data-touch-target="44"
            onClick={() => setMountAttempt((attempt) => attempt + 1)}
          >
            Retry map
          </button>
        </div>
      ) : null}
    </>
  );
}
