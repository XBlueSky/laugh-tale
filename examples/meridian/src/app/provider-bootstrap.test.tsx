import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppProps } from "./App";
import { catalog } from "../presentation/copy/catalog";

const boundary = vi.hoisted(() => ({ roots: [] as Root[], props: undefined as AppProps | undefined, configure: vi.fn(), freeModeFixture: false, freeConfigure: vi.fn() }));
vi.mock("../trip-content/trip", async () => {
  const { completeTrip } = await import("../trip-content/fixtures/complete-trip");
  const authoredTrip = { ...completeTrip, routes: completeTrip.routes.filter(edge => edge.source !== "provider") };
  return { get trip() { return boundary.freeModeFixture ? authoredTrip : completeTrip; } };
});
vi.mock("./maplibre-runtime", () => ({ createMapLibreRuntime: boundary.freeConfigure }));
vi.mock("react-dom/client", async (original) => {
  const actual = await original<typeof import("react-dom/client")>();
  return { ...actual, createRoot: (...args: Parameters<typeof actual.createRoot>) => {
    const root = actual.createRoot(...args);
    boundary.roots.push(root);
    const render = root.render.bind(root);
    root.render = (element) => {
      boundary.props = (element as ReactElement<{ children: ReactElement<AppProps> }>).props.children.props;
      render(element);
    };
    return root;
  } };
});
vi.mock("@laugh-tale-island/adapters/google", async (original) => ({
  ...await original<typeof import("@laugh-tale-island/adapters/google")>(),
  configureGoogleMaps: boundary.configure,
}));

const key = "SYNTHETIC-KEY-NOT-A-CREDENTIAL";
beforeEach(() => {
  vi.resetModules();
  boundary.props = undefined;
  boundary.configure.mockReset();
  boundary.freeModeFixture = false;
  boundary.freeConfigure.mockReset().mockImplementation(async () => ({ createMap: (await import("../../tests/e2e/fixtures/e2e-trip")).createE2EMapAdapter }));
  // Progress persists through Web Storage where the runtime provides it (Node 22 jsdom).
  globalThis.localStorage?.clear();
  document.body.innerHTML = '<div id="root"></div>';
  vi.stubEnv("DEV", true);
  vi.stubEnv("VITE_E2E_FAKE_PROVIDER", "false");
  vi.stubEnv("VITE_MAP_PROVIDER", "");
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", key);
  vi.stubEnv("VITE_GOOGLE_MAP_ID", "");
  vi.stubEnv("VITE_GOOGLE_CLOUD_STYLE_PROFILE_ID", "");
  vi.stubEnv("VITE_GOOGLE_ROUTES_ENABLED", "true");
  vi.stubEnv("VITE_GOOGLE_PLACES_ENABLED", "true");
  boundary.configure.mockResolvedValue({ status: "unavailable", reason: "loader-failed", retryable: true, diagnostic: `Loader rejected ${key}; repeated ${key}` });
});
afterEach(() => {
  act(() => { for (const root of boundary.roots.splice(0)) root.unmount(); });
  document.body.replaceChildren();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("provider bootstrap composition", () => {
  it("free mode ignores legacy Google keys and paid flags", async () => {
    boundary.freeModeFixture = true; vi.stubEnv("VITE_MAP_PROVIDER", "maplibre");
    await act(async () => { await import("../main"); });
    await waitFor(() => expect(typeof boundary.props?.runtime?.createMap).toBe("function"));
    expect(boundary.configure).not.toHaveBeenCalled();
    expect(typeof boundary.props?.runtime?.createPlaces).toBe("undefined");
    expect(typeof boundary.props?.runtime?.createRoutes).toBe("undefined");
    expect(boundary.roots).toHaveLength(1);
  });
  it.each(["invalid", "maplibre"])("rejects %s configuration/provenance without a Google fallback", async provider => {
    vi.stubEnv("VITE_MAP_PROVIDER", provider);
    await act(async () => { await import("../main"); });
    expect(boundary.props?.providerBootstrap?.map).toMatchObject({ status: "unavailable", reason: "unsupported", retryable: false });
    expect(boundary.configure).not.toHaveBeenCalled(); expect(boundary.freeConfigure).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Synthetic Archipelago Journey" })).toBeVisible();
  });
  it("preserves progress and ignores stale free-map bootstrap settlements", async () => {
    boundary.freeModeFixture = true; vi.stubEnv("VITE_MAP_PROVIDER", "maplibre");
    let reject!: (error: Error) => void;
    boundary.freeConfigure.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    await act(async () => { await import("../main"); });
    await waitFor(() => expect(boundary.freeConfigure).toHaveBeenCalledOnce());
    expect(screen.getByRole("checkbox", { name: /Pack identification/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: /Pack identification/ }));
    await act(async () => { boundary.props?.runtime?.retryMapBootstrap?.(); await Promise.resolve(); });
    await waitFor(() => expect(typeof boundary.props?.runtime?.createMap).toBe("function"));
    await act(async () => { reject(new Error("stale load")); await Promise.resolve(); });
    expect(screen.getByRole("checkbox", { name: /Pack identification/ })).toBeChecked();
    expect(boundary.props?.providerBootstrap?.map).toBeUndefined();
    expect(boundary.configure).not.toHaveBeenCalled(); expect(boundary.roots).toHaveLength(1);
  });
  it("ignores stale configuration settlement after a newer supported attempt succeeds", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let reject!: (reason: Error) => void;
    boundary.configure.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    await act(async () => { await import("../main"); });
    const { createE2EMapAdapter } = await import("../../tests/e2e/fixtures/e2e-trip");
    boundary.configure.mockResolvedValueOnce({ status: "ready", createMap: createE2EMapAdapter });
    await act(async () => { boundary.props?.runtime?.retryMapBootstrap?.(); await Promise.resolve(); });
    expect(boundary.props?.runtime).toMatchObject({ createMap: createE2EMapAdapter });
    await act(async () => { reject(new Error("old attempt")); await Promise.resolve(); });
    expect(boundary.props?.runtime).toMatchObject({ createMap: createE2EMapAdapter });
    expect(boundary.props?.providerBootstrap?.map).toBeUndefined();
    expect(boundary.roots).toHaveLength(1);
  });
  it("renders authored Home and navigates during unresolved configuration, then retries without losing progress", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv("VITE_GOOGLE_ROUTES_ENABLED", "false");
    vi.stubEnv("VITE_GOOGLE_PLACES_ENABLED", "false");
    let reject!: (reason: Error) => void;
    boundary.configure.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    await act(async () => { await import("../main"); });
    expect(screen.getByRole("heading", { name: "Synthetic Archipelago Journey" })).toBeVisible();
    expect(boundary.props?.providerBootstrap?.map).toEqual({ status: "loading", retryable: false });
    expect(screen.getByRole("checkbox", { name: /Pack identification/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: /Pack identification/ }));
    expect(screen.getByRole("checkbox", { name: /Pack identification/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: catalog.home.openExperience }));
    expect(screen.getByText("Harbor shuttle")).toBeVisible();
    const mapHost = screen.getByRole("region", { name: catalog.accessibleNames.map });
    await act(async () => { reject(new Error("synthetic loader rejection")); await Promise.resolve(); });
    const retry = await screen.findByRole("button", { name: catalog.provider.retry });
    const { createE2EMapAdapter } = await import("../../tests/e2e/fixtures/e2e-trip");
    boundary.configure.mockResolvedValueOnce({ status: "ready", createMap: createE2EMapAdapter });
    await act(async () => { fireEvent.click(retry); await Promise.resolve(); });
    await waitFor(() => expect(boundary.props?.runtime).toMatchObject({ createMap: createE2EMapAdapter }));
    expect(boundary.configure).toHaveBeenCalledTimes(2);
    expect(boundary.roots).toHaveLength(1);
    expect(screen.getByRole("region", { name: catalog.accessibleNames.map })).toBe(mapHost);
    expect(screen.queryByRole("button", { name: catalog.provider.retry })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: catalog.experience.home }));
    expect(screen.getByRole("checkbox", { name: /Pack identification/ })).toBeChecked();
  });
  it("keeps independent HTTP factories and usable content when the map loader fails, redacting development output", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await act(async () => { await import("../main"); });
    expect(await screen.findByRole("heading", { name: "Synthetic Archipelago Journey" })).toBeVisible();
    expect(typeof boundary.props?.runtime?.createRoutes).toBe("function");
    expect(typeof boundary.props?.runtime?.createPlaces).toBe("function");
    expect(typeof boundary.props?.runtime?.createMap).toBe("undefined");
    expect(boundary.props?.providerBootstrap?.map).toMatchObject({ diagnostic: "Loader rejected [redacted]; repeated [redacted]" });
    boundary.props?.onDiagnostic?.({ scope: "provider", channel: "route", phase: "request", reason: "network", diagnostic: `Provider used ${key}`, cause: new Error(`Secret ${key}`) });
    await waitFor(() => expect(warn).toHaveBeenCalled());
    const output = warn.mock.calls.map((call) => call.map((value) => value instanceof Error ? value.message : JSON.stringify(value)).join(" ")).join("\n");
    expect(output).not.toContain(key);
    expect(output).toContain("route");
    expect(output).toContain("request");
    expect(output).toContain("network");
    expect(document.documentElement.innerHTML).not.toContain(key);
    expect(document.documentElement.innerHTML).not.toContain("Loader rejected");
  });

  it("has no default production diagnostic output", async () => {
    vi.stubEnv("DEV", false);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await act(async () => { await import("../main"); });
    expect(await screen.findByRole("heading", { name: "Synthetic Archipelago Journey" })).toBeVisible();
    expect(boundary.props?.onDiagnostic).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it("requires paired map styling identity before asking the loader", async () => {
    vi.stubEnv("VITE_GOOGLE_MAP_ID", "synthetic-map");
    vi.stubEnv("VITE_GOOGLE_CLOUD_STYLE_PROFILE_ID", "unmatched-profile");
    boundary.configure.mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await act(async () => { await import("../main"); });
    expect(boundary.configure).not.toHaveBeenCalled();
    expect(boundary.props?.providerBootstrap?.map).toMatchObject({ status: "unavailable", reason: "loader-failed", retryable: false });
    expect(typeof boundary.props?.runtime?.createRoutes).toBe("function");
    expect(typeof boundary.props?.runtime?.createPlaces).toBe("function");
  });
});
