import type {
  ExperienceActions,
  ExperienceBindings,
  ExperienceViewModel,
} from "../../controllers/presentation-contract";

export interface ItineraryMapViewProps {
  map: ExperienceViewModel["map"];
  binding: ExperienceBindings["map"];
  retry: ExperienceActions["retryMap"];
}

function containerRef(binding: ExperienceBindings["map"]) {
  return binding.ref;
}

export function ItineraryMapView({
  map,
  binding,
  retry,
}: ItineraryMapViewProps) {
  return (
    <>
      <div
        ref={containerRef(binding)}
        className="itinerary-map"
        data-testid="itinerary-map"
        data-map-canvas="persistent"
        data-map-status={map.status}
        role="region"
        aria-label="Trip map"
      />
      {map.status === "error" ? (
        <div className="map-degraded-state" role="alert">
          <span>Map unavailable. The itinerary remains available.</span>
          <button type="button" data-touch-target="44" onClick={retry}>
            Retry map
          </button>
        </div>
      ) : null}
    </>
  );
}
