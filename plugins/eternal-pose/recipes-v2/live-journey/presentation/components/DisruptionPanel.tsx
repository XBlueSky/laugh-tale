import type { ExperienceActions, ExperienceRouteViewModel } from "../../controllers/presentation-contract";

function routeLabel(route: ExperienceRouteViewModel): string {
  return `${route.edge.mode} route from ${route.edge.fromNodeId} to ${route.edge.toNodeId}`;
}

export function DisruptionPanel({ routes, onRetry }: { routes: readonly ExperienceRouteViewModel[]; onRetry: ExperienceActions["retryRoute"] }) {
  const unavailable = routes.filter((route) => route.loadState?.status === "unavailable");
  const loading = routes.filter((route) => route.loadState?.status === "loading");
  if (unavailable.length === 0 && loading.length === 0) return null;
  return (
    <section className="live-disruption" data-contract-state="disruption" aria-label="Journey disruptions" data-disruption-count={unavailable.length}>
      <header>
        <span className="live-kicker">DISRUPTION</span>
        <h2>{unavailable.length > 0 ? "Route attention needed" : "Reading route details"}</h2>
      </header>
      {unavailable.length > 0 ? (
        <ul>
          {unavailable.map((route) => (
            <li key={route.edge.id} data-route-owner={route.edge.id} data-route-state="unavailable">
              <span>{routeLabel(route)}</span>
              <span>{route.loadState?.status === "unavailable" && route.loadState.reason.trim().length > 0 ? route.loadState.reason : "Provider did not return a route."}</span>
              <button type="button" data-contract-action="retry-route" data-touch-target="44" aria-label={`Retry ${routeLabel(route)}`} onClick={() => onRetry(route.edge.id)}>Retry</button>
            </li>
          ))}
        </ul>
      ) : null}
      {loading.length > 0 ? <p data-disruption-state="loading">Route details are loading.</p> : null}
    </section>
  );
}
