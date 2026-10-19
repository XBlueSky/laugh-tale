import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeMapAdapterV2, FakeProgressStore, syntheticTripV2 } from "@laugh-tale-island/testing";
import type { TripDiagnosticEvent } from "@laugh-tale-island/react";
import { catalog, presentation } from "../presentation";
import { App } from "./App";

afterEach(cleanup);
const missing = { status: "unavailable", reason: "missing-configuration", retryable: false } as const;
const trip = { ...syntheticTripV2, title: "Harbor journey", locale: "fr-CA", destinationLabel: "Coastal week" };
const clock = () => "2042-03-04T14:30:00Z";
const firstDayName = `${catalog.home.openDay} · ${catalog.experience.dayOfTrip.replace("{ordinal}", "1")}`;

describe("App v2 composition", () => {
  it("uses the setup locale without constructing providers for missing content", () => {
    const createMap = vi.fn(() => new FakeMapAdapterV2());
    render(<App trip={null} setupLocale="de-AT" runtime={{ createMap }} />);
    expect(screen.getByRole("heading", { name: catalog.setup.title })).toBeVisible();
    expect(createMap).not.toHaveBeenCalled();
    expect(document.documentElement.lang).toBe("de-AT");
  });
  it("keeps valid content usable for missing configuration and loader failure, isolating diagnostics", async () => {
    const events: TripDiagnosticEvent[] = [];
    const props = { trip, setupLocale: "en", clock, progressStore: new FakeProgressStore(), onDiagnostic: (event: TripDiagnosticEvent) => events.push(event) };
    const { rerender } = render(<App {...props} providerBootstrap={{ map: missing, routes: missing, places: missing }} />);
    expect(await screen.findByRole("heading", { name: "Harbor journey" })).toBeVisible();
    expect(document.title).toBe("Harbor journey");
    fireEvent.click(screen.getByRole("button", { name: firstDayName }));
    expect(await screen.findByRole("region", { name: catalog.accessibleNames.map })).toBeVisible();
    expect(screen.queryByRole("heading", { name: catalog.setup.title })).toBeNull();
    const failure = { status: "unavailable", reason: "loader-failed", retryable: true, diagnostic: "PRIVATE_BOOTSTRAP_DETAIL" } as const;
    rerender(<App {...props} providerBootstrap={{ map: failure }} />);
    await waitFor(() => expect(events).toContainEqual(expect.objectContaining({ scope: "provider", phase: "bootstrap", diagnostic: "PRIVATE_BOOTSTRAP_DETAIL" })));
    expect(document.documentElement.innerHTML).not.toContain("PRIVATE_BOOTSTRAP_DETAIL");
  });
  it("injects both presentation factories into the real map session", async () => {
    const map = new FakeMapAdapterV2();
    render(<App trip={trip} setupLocale="en" clock={clock} progressStore={new FakeProgressStore()} runtime={{ createMap: () => map }} />);
    fireEvent.click(await screen.findByRole("button", { name: firstDayName }));
    await waitFor(() => expect(map.mountCalls).toHaveLength(1));
    expect(map.mountCalls[0].config.createMarkerContent).toBe(presentation.createMarkerContent);
    expect(map.mountCalls[0].config.createUserLocationContent).toBe(presentation.createUserLocationContent);
    expect(map.markerFactoryCalls.length).toBeGreaterThan(0);
    const canvas = screen.getByRole("region", { name: catalog.accessibleNames.map });
    fireEvent.click(screen.getByRole("button", { name: catalog.accessibleNames.collapseDayRail }));
    expect(screen.getByRole("region", { name: catalog.accessibleNames.map })).toBe(canvas);
    expect(map.mountCalls).toHaveLength(1);
  });
  it("keeps the trip identity visible while viewing a day on the map", async () => {
    render(<App trip={trip} setupLocale="en" clock={clock} progressStore={new FakeProgressStore()} providerBootstrap={{ map: missing }} />);
    fireEvent.click(await screen.findByRole("button", { name: firstDayName }));
    const header = await screen.findByRole("banner", { name: catalog.accessibleNames.header });
    const heading = within(header).getByRole("heading", { level: 1, name: "Harbor journey · Synthetic contract day" });
    expect(heading).toBeVisible();
    expect(heading).toHaveTextContent("Synthetic contract day");
  });
  it("routes runtime map failures through the sink while retaining the itinerary", async () => {
    const map = new FakeMapAdapterV2();
    const onDiagnostic = vi.fn();
    render(<App trip={trip} setupLocale="en" clock={clock} progressStore={new FakeProgressStore()} runtime={{ createMap: () => map }} onDiagnostic={onDiagnostic} />);
    fireEvent.click(await screen.findByRole("button", { name: firstDayName }));
    await waitFor(() => expect(map.mountCalls).toHaveLength(1));
    act(() => map.emitUnavailable({ status: "unavailable", reason: "network", retryable: true, diagnostic: "PRIVATE_RUNTIME_DETAIL" }));
    await waitFor(() => expect(onDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ scope: "provider", channel: "map", phase: "runtime", diagnostic: "PRIVATE_RUNTIME_DETAIL" })));
    expect(screen.getByRole("region", { name: catalog.accessibleNames.itinerarySheet })).toBeVisible();
    expect(document.documentElement.innerHTML).not.toContain("PRIVATE_RUNTIME_DETAIL");
  });
  it("reports render failures through the sink and advertises no absent recovery", async () => {
    const onDiagnostic = vi.fn();
    const error = new Error("PRIVATE_RENDER_DETAIL");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      render(<App trip={trip} setupLocale="en" clock={clock} progressStore={new FakeProgressStore()} onDiagnostic={onDiagnostic} presentation={{ ...presentation, Home: () => { throw error; } }} />);
      expect(await screen.findByRole("alert")).toHaveTextContent(catalog.fatal.render);
      expect(onDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ scope: "controller", phase: "render", cause: error }));
      expect(screen.queryByRole("button", { name: catalog.fatal.retry })).toBeNull();
      expect(document.documentElement.innerHTML).not.toContain("PRIVATE_RENDER_DETAIL");
    } finally { consoleError.mockRestore(); }
  });
});
