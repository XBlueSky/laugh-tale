import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RouteEdge } from "../../trip-core/model";
import type { RoutePresentation } from "../../trip-core/routes";
import { RouteConnector } from "./RouteConnector";

function routePresentation(
  overrides: Partial<RouteEdge> = {},
): RoutePresentation {
  return {
    display: "full",
    navigable: true,
    edge: {
      id: "museum--dinner",
      dayId: "day-1",
      fromNodeId: "museum",
      toNodeId: "dinner",
      mode: "transit",
      source: "manual",
      certainty: "suggested",
      durationMinutes: 18,
      summary: "Ginza line · 18 min",
      navigation: { origin: "Museum", destination: "Dinner" },
      ...overrides,
    },
  };
}

const readyState = {
  status: "ready" as const,
  durationMinutes: 18,
  path: [
    { lat: 35.7, lng: 139.7 },
    { lat: 35.71, lng: 139.71 },
  ],
  steps: ["Walk to Ueno", "Take the Ginza line", "Walk to dinner"],
};

afterEach(cleanup);
beforeEach(() => {
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe("RouteConnector", () => {
  it("keeps a route readable and static until both focusable geometry and a callback exist", () => {
    const { rerender } = render(<RouteConnector route={routePresentation()} />);

    expect(screen.getByText("Ginza line · 18 min")).toBeVisible();
    expect(screen.getByText("Ginza line · 18 min").closest("[aria-hidden]"))
      .toBeNull();
    expect(screen.queryByRole("button", { name: /Ginza line/ })).not.toBeInTheDocument();

    rerender(
      <RouteConnector
        route={routePresentation()}
        state={{ ...readyState, path: [] }}
        onRouteSelect={() => undefined}
      />,
    );
    expect(screen.queryByRole("button", { name: /Ginza line/ })).not.toBeInTheDocument();

    rerender(<RouteConnector route={routePresentation()} state={readyState} />);
    expect(screen.queryByRole("button", { name: /Ginza line/ })).not.toBeInTheDocument();
  });

  it("uses one route-owner control when concrete geometry and selection callback exist", async () => {
    const user = userEvent.setup();
    const onRouteSelect = vi.fn();
    const { container } = render(
      <RouteConnector
        route={routePresentation()}
        state={readyState}
        onRouteSelect={onRouteSelect}
      />,
    );

    const control = container.querySelector('[data-route-id="museum--dinner"]');
    expect(control).toBeInstanceOf(HTMLButtonElement);
    expect(control).toHaveAttribute("data-touch-target", "44");
    expect(container.querySelectorAll('[data-route-id="museum--dinner"]')).toHaveLength(1);
    await user.click(control!);
    expect(onRouteSelect).toHaveBeenCalledTimes(1);
    expect(onRouteSelect).toHaveBeenCalledWith("museum--dinner");
  });

  it("uses ready duration data and marks unconfirmed travel estimates approximate", () => {
    const route = routePresentation({ summary: undefined, durationMinutes: undefined });
    const { rerender } = render(
      <RouteConnector
        route={route}
        state={{ ...readyState, durationMinutes: 12 }}
        onRouteSelect={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "transit · 約 12 min" })).toBeVisible();

    rerender(
      <RouteConnector
        route={{ ...route, edge: { ...route.edge, certainty: "confirmed" } }}
        state={{ ...readyState, durationMinutes: 12 }}
        onRouteSelect={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "transit · 12 min" })).toBeVisible();
  });

  it("replaces the collapsed transit summary with compact expanded details", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <RouteConnector
        route={routePresentation()}
        state={readyState}
        destinationTiming={{ start: "18:00", certainty: "suggested" }}
        onRouteSelect={() => undefined}
      />,
    );
    const disclosure = screen.getByRole("button", { name: /Ginza line · 18 min/ });
    const targetId = disclosure.getAttribute("aria-controls");

    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(targetId).toBeTruthy();
    expect(document.getElementById(targetId!)).toBeInTheDocument();
    await user.click(disclosure);

    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText("Ginza line · 18 min")).not.toBeInTheDocument();
    expect(screen.getByText("約 18:00").closest("time")).toHaveAttribute(
      "datetime",
      "18:00",
    );
    const details = document.getElementById(targetId!);
    await waitFor(() => expect(details).toHaveStyle({ height: "auto", opacity: "1" }));
    expect(screen.getByText("Take the Ginza line")).toBeVisible();
    expect(details).toHaveAttribute("data-motion-properties", "height opacity");
    expect(details).toHaveAttribute("data-motion-duration", "200ms");
    expect(container.querySelectorAll("button button, button a, a button")).toHaveLength(0);
  });

  it("uses zero-duration route disclosure motion when reduced motion is requested", () => {
    render(
      <RouteConnector
        route={routePresentation()}
        state={readyState}
        onRouteSelect={() => undefined}
        reducedMotion
      />,
    );

    const disclosure = screen.getByRole("button", { name: /Ginza line · 18 min/ });
    const targetId = disclosure.getAttribute("aria-controls");
    expect(document.getElementById(targetId!)).toHaveAttribute(
      "data-motion-duration",
      "0ms",
    );
  });

  it("detects the user's reduced-motion preference when the shell does not pass an override", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    render(
      <RouteConnector
        route={routePresentation()}
        state={readyState}
        onRouteSelect={() => undefined}
      />,
    );

    const disclosure = screen.getByRole("button", { name: /Ginza line · 18 min/ });
    const targetId = disclosure.getAttribute("aria-controls");
    expect(document.getElementById(targetId!)).toHaveAttribute(
      "data-motion-duration",
      "0ms",
    );
  });

  it("uses the same navigation icon vocabulary for collapsed walking and transit", () => {
    const { rerender } = render(
      <RouteConnector
        route={routePresentation({ mode: "walking", summary: "Walk 4 min" })}
      />,
    );
    expect(screen.getByText("Walk 4 min").parentElement?.querySelector(
      '[data-route-mode-icon="navigation"]',
    )).not.toBeNull();

    rerender(<RouteConnector route={routePresentation()} />);
    expect(screen.getByText("Ginza line · 18 min").parentElement?.querySelector(
      '[data-route-mode-icon="navigation"]',
    )).not.toBeNull();
  });

  it("keeps external navigation separate, named, and at least a 44px target", () => {
    render(
      <RouteConnector
        route={routePresentation()}
        navigationHref="https://www.google.com/maps/dir/?api=1&travelmode=transit"
      />,
    );

    const link = screen.getByRole("link", {
      name: "Open live transit directions from Museum to Dinner",
    });
    expect(link).toHaveAttribute("data-touch-target", "44");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).not.toHaveAttribute("data-route-id");
  });

  it("keeps loading, ready, and error geometry compact and vertically aligned at 320px", () => {
    const retry = vi.fn();
    const { container, rerender } = render(
      <div style={{ width: 320 }}>
        <RouteConnector
          route={routePresentation()}
          state={{ status: "loading" }}
          onRetry={retry}
        />
      </div>,
    );

    const loading = screen.getByRole("status", { name: "Loading route" });
    expect(loading).toHaveAttribute("data-layout", "compact-center");
    expect(loading).toHaveAttribute("data-state", "loading");
    expect(container.querySelectorAll(".route-connector")).toHaveLength(1);
    expect(container.querySelector(".itinerary-row")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry route" }));
    expect(retry).toHaveBeenCalledTimes(1);

    rerender(
      <div style={{ width: 320 }}>
        <RouteConnector route={routePresentation()} state={readyState} />
      </div>,
    );
    expect(container.querySelector(".route-connector")).toHaveAttribute(
      "data-layout",
      "compact-center",
    );

    rerender(
      <div style={{ width: 320 }}>
        <RouteConnector
          route={routePresentation()}
          state={{ status: "unavailable", reason: "No route available" }}
          onRetry={retry}
        />
      </div>,
    );
    expect(screen.getByRole("status", { name: "Route unavailable" })).toHaveAttribute(
      "data-layout",
      "compact-center",
    );
  });
});
