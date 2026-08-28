import type {
  ExperienceActions,
  ExperienceBindings,
  ExperienceViewModel,
} from "../../controllers/presentation-contract";

export interface AtlasMapSurfaceProps {
  map: ExperienceViewModel["map"];
  binding: ExperienceBindings["map"];
  retry: ExperienceActions["retryMap"];
}

function containerRef(binding: ExperienceBindings["map"]) {
  return binding.ref;
}

export function AtlasMapSurface({ map, binding, retry }: AtlasMapSurfaceProps) {
  return (
    <section className="atlas-map-surface" data-map-status={map.status}>
      <div className="atlas-map-grid" aria-hidden="true" />
      <div
        ref={containerRef(binding)}
        className="itinerary-map atlas-map-canvas"
        data-testid="itinerary-map"
        data-contract-surface="map"
        data-map-canvas="persistent"
        data-provider-canvas="bounded"
        data-map-status={map.status}
        role="region"
        aria-label="Trip map"
      />
      <aside className="atlas-legend" aria-label="Map legend">
        <span><i data-legend-shape="current" />Current</span>
        <span><i data-legend-shape="selected" />Selected</span>
        <span><i data-legend-shape="uncertain" />Uncertain route</span>
      </aside>
      {map.status === "error" ? (
        <div className="atlas-map-error" role="alert">
          <strong>Map unavailable</strong>
          <span>The itinerary remains available.</span>
          <button type="button" data-touch-target="44" onClick={retry}>
            Retry map
          </button>
        </div>
      ) : null}
    </section>
  );
}
