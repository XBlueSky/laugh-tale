import {
  ArrowUpRight,
  CircleAlert,
  LoaderCircle,
  Navigation,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useId, useState } from "react";

import type { Timing } from "../../trip-core/model";
import type { RoutePresentation } from "../../trip-core/routes";
import { formatTimingLabel } from "../../trip-core/time";
import type { RouteResult } from "../../experience-shell/provider-contracts";

export type RouteConnectorState = RouteResult | { status: "loading" };

export interface RouteConnectorProps {
  route: RoutePresentation;
  state?: RouteConnectorState;
  destinationTiming?: Timing;
  onRouteSelect?: (routeId: string) => void;
  onRetry?: (routeId: string) => void;
  navigationHref?: string;
  reducedMotion?: boolean;
}

function collapsedSummary(
  route: RoutePresentation,
  readyDurationMinutes: number | undefined,
): string {
  if (route.edge.summary !== undefined) {
    return route.edge.summary;
  }
  const durationMinutes = readyDurationMinutes ?? route.edge.durationMinutes;
  if (durationMinutes !== undefined) {
    const certaintyPrefix = route.edge.certainty === "confirmed" ? "" : "約 ";
    return `${route.edge.mode} · ${certaintyPrefix}${durationMinutes} min`;
  }
  return route.edge.mode;
}

function NavigationIcon() {
  return (
    <Navigation
      aria-hidden="true"
      data-route-mode-icon="navigation"
      size={17}
      strokeWidth={1.8}
    />
  );
}

function usePreferredReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? false
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (): void => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function RouteConnector({
  route,
  state,
  destinationTiming,
  onRouteSelect,
  onRetry,
  navigationHref,
  reducedMotion,
}: RouteConnectorProps) {
  const [expanded, setExpanded] = useState(false);
  const prefersReducedMotion = usePreferredReducedMotion();
  const generatedId = useId().replaceAll(":", "");
  const detailsId = `route-details-${generatedId}`;
  const ready = state?.status === "ready" ? state : undefined;
  const label = collapsedSummary(route, ready?.durationMinutes);
  const focusable =
    ready !== undefined &&
    ready.path.length > 0 &&
    onRouteSelect !== undefined;
  const canDisclose =
    focusable && route.edge.mode === "transit" && ready.steps.length > 0;
  const duration = (reducedMotion ?? prefersReducedMotion ?? false) ? 0 : 0.2;
  const navigation = route.edge.navigation;

  const retryControl = onRetry === undefined ? null : (
    <button
      type="button"
      className="icon-control route-connector__retry"
      aria-label="Retry route"
      data-touch-target="44"
      onClick={() => onRetry(route.edge.id)}
    >
      Retry
    </button>
  );

  let connector;
  if (state?.status === "loading") {
    connector = (
      <div
        className="route-connector"
        role="status"
        aria-label="Loading route"
        data-route-owner={route.edge.id}
        data-layout="compact-center"
        data-state="loading"
      >
        <LoaderCircle aria-hidden="true" size={17} strokeWidth={1.8} />
        <span>Loading route</span>
        {retryControl}
      </div>
    );
  } else if (state?.status === "unavailable") {
    connector = (
      <div
        className="route-connector"
        role="status"
        aria-label="Route unavailable"
        data-route-owner={route.edge.id}
        data-layout="compact-center"
        data-state="error"
      >
        <CircleAlert aria-hidden="true" size={17} strokeWidth={1.8} />
        <span>{state.reason}</span>
        {retryControl}
      </div>
    );
  } else if (focusable) {
    connector = (
      <button
        type="button"
        className="route-connector"
        aria-label={expanded ? "Hide transit route details" : label}
        {...(canDisclose
          ? { "aria-controls": detailsId, "aria-expanded": expanded }
          : {})}
        data-route-id={route.edge.id}
        data-route-owner={route.edge.id}
        data-layout="compact-center"
        data-display={route.display}
        data-touch-target="44"
        onClick={() => {
          onRouteSelect(route.edge.id);
          if (canDisclose) {
            setExpanded((current) => !current);
          }
        }}
      >
        <NavigationIcon />
        <span>{expanded && canDisclose ? "Transit details" : label}</span>
      </button>
    );
  } else {
    connector = (
      <div
        className="route-connector"
        data-route-owner={route.edge.id}
        data-layout="compact-center"
        data-display={route.display}
      >
        <NavigationIcon />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div
      className="route-connector-shell"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        alignItems: "center",
        minWidth: 0,
      }}
    >
      {connector}

      {canDisclose ? (
        <motion.div
          id={detailsId}
          className="route-connector__details"
          initial={false}
          animate={{ height: expanded ? "auto" : 0, opacity: expanded ? 1 : 0 }}
          transition={{ duration, ease: "easeOut" }}
          aria-hidden={!expanded}
          inert={!expanded}
          data-motion-properties="height opacity"
          data-motion-duration={`${duration * 1000}ms`}
          style={{ overflow: "hidden", gridColumn: "1 / -1" }}
        >
          <div
            style={{
              padding: "var(--space-1) var(--space-2) var(--space-2) var(--space-4)",
              color: "var(--color-text-muted)",
              fontSize: "var(--font-size-meta)",
            }}
          >
            {destinationTiming === undefined ? null : (
              <span className="route-connector__arrival">
                Arrive{" "}
                {destinationTiming.start === undefined ||
                destinationTiming.certainty === "unknown" ? (
                  <span>{formatTimingLabel(destinationTiming)}</span>
                ) : (
                  <time dateTime={destinationTiming.start}>
                    {formatTimingLabel(destinationTiming)}
                  </time>
                )}
              </span>
            )}
            <ol style={{ margin: 0, paddingInlineStart: "1.25rem" }}>
              {ready.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </motion.div>
      ) : null}

      {navigationHref === undefined ? null : (
        <a
          className="icon-control route-connector__external"
          href={navigationHref}
          target="_blank"
          rel="noreferrer"
          aria-label={
            navigation === undefined
              ? `Open live ${route.edge.mode} directions`
              : `Open live ${route.edge.mode} directions from ${navigation.origin} to ${navigation.destination}`
          }
          data-touch-target="44"
          style={{ gridColumn: 2, gridRow: 1 }}
        >
          <ArrowUpRight aria-hidden="true" size={18} strokeWidth={1.8} />
        </a>
      )}
    </div>
  );
}
