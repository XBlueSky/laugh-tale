import { describe, expect, it } from "vitest";
import {
  createMemoryTripNavigationStore,
  reduceExperienceChoreography,
  reframeCameraIntent,
  resolveFitCameraIntent,
  resolveFocusCameraIntent,
  resolveMapLayout,
  resolveRecenterUserCameraIntent,
} from "@laugh-tale-island/core";
import type {
  CameraIntent,
  CameraIntentBase,
  CameraIntentContext,
  CameraSnapshot,
  CameraTransition,
  EdgeInsets,
  FitCameraGeometry,
  FitCameraIntent,
  FocusCameraIntent,
  MapLayoutSnapshot,
  MapRoutePresentation,
  MapViewportMetrics,
  NavigationTargetV2,
  OcclusionRect,
  RecenterUserCameraIntent,
  SemanticOwnerState,
  UsableRegion,
} from "@laugh-tale-island/core";
import type {
  MapAdapterV2,
  MapBasemapPalette,
  MapEventsV2,
  MapMountConfig,
  MapPresentationV2,
  MapRoutePaint,
  MapRoutePresentationV2,
  MapRouteStroke,
  MapRouteStyle,
  MapRouteSymbol,
  MapSolidRouteStyle,
  MapSymbolRouteStyle,
  MapVisualProfile,
  MarkerContentFactory,
  MarkerContentHandle,
  MarkerDescriptor,
  MarkerSemanticState,
  NavigationAdapterV2,
  NavigationRequestV2,
  PlaceAdapterV2,
  RouteAdapterV2,
  UserLocationContentFactory,
  UserLocationContentHandle,
  UserLocationDescriptor,
} from "@laugh-tale-island/core/browser";

// @ts-expect-error Browser map adapters must not be exported from the root entry.
import type { MapAdapterV2 as RootMapAdapterV2 } from "@laugh-tale-island/core";
// @ts-expect-error Browser mount configuration must not be exported from the root entry.
import type { MapMountConfig as RootMapMountConfig } from "@laugh-tale-island/core";
// @ts-expect-error Browser navigation requests must not be exported from the root entry.
import type { NavigationRequestV2 as RootNavigationRequestV2 } from "@laugh-tale-island/core";

type BrowserContractLedger = [
  MapAdapterV2,
  MapBasemapPalette,
  MapEventsV2,
  MapMountConfig,
  MapPresentationV2,
  MapRoutePaint,
  MapRoutePresentationV2,
  MapRouteStroke,
  MapRouteStyle,
  MapRouteSymbol,
  MapSolidRouteStyle,
  MapSymbolRouteStyle,
  MapVisualProfile,
  MarkerContentFactory,
  MarkerContentHandle,
  MarkerDescriptor,
  MarkerSemanticState,
  NavigationAdapterV2,
  NavigationRequestV2,
  PlaceAdapterV2,
  RouteAdapterV2,
  UserLocationContentFactory,
  UserLocationContentHandle,
  UserLocationDescriptor,
  CameraIntent,
  CameraIntentBase,
  CameraIntentContext,
  CameraSnapshot,
  CameraTransition,
  EdgeInsets,
  FitCameraGeometry,
  FitCameraIntent,
  FocusCameraIntent,
  MapViewportMetrics,
  MapLayoutSnapshot,
  OcclusionRect,
  RecenterUserCameraIntent,
  UsableRegion,
];

const browserContractLedger: BrowserContractLedger | undefined = undefined;
type RootContractLedger = [NavigationTargetV2, SemanticOwnerState, CameraIntent, CameraSnapshot];
type RootBrowserLeakLedger = [
  RootMapAdapterV2,
  RootMapMountConfig,
  RootNavigationRequestV2,
];

const rootContractLedger: RootContractLedger | undefined = undefined;
const rootBrowserLeakLedger: RootBrowserLeakLedger | undefined = undefined;

const semanticRoute: MapRoutePresentation = {
  edgeId: "route-a-b",
  path: [
    { lat: 25, lng: 121 },
    { lat: 25.1, lng: 121.1 },
  ],
  tone: "default",
  source: "manual",
  certainty: "confirmed",
  mode: "walking",
};

describe("package entry points", () => {
  it("exposes the root entry without browser globals", async () => {
    const root = await import("@laugh-tale-island/core");
    expect(typeof root.validateTrip).toBe("function");
    expect(typeof root.resolveSheetGeometry).toBe("function");
    expect(typeof root.buildMapPresentation).toBe("function");
    expect(typeof root.buildTimelineEntries).toBe("function");
    expect(typeof createMemoryTripNavigationStore).toBe("function");
    expect(typeof reduceExperienceChoreography).toBe("function");
    expect(typeof resolveMapLayout).toBe("function");
    expect(typeof resolveFitCameraIntent).toBe("function");
    expect(typeof resolveFocusCameraIntent).toBe("function");
    expect(typeof resolveRecenterUserCameraIntent).toBe("function");
    expect(typeof reframeCameraIntent).toBe("function");
    expect(root.USER_LOCATION_OWNER_ID).toContain("map-place-owner:");
    expect(semanticRoute).toMatchObject({
      edgeId: "route-a-b",
      source: "manual",
      certainty: "confirmed",
      mode: "walking",
    });
  });

  it("exposes the browser subpath", async () => {
    const browser = await import("@laugh-tale-island/core/browser");
    expect(browser).toBeDefined();
    expect(browserContractLedger).toBeUndefined();
    expect(rootContractLedger).toBeUndefined();
    expect(rootBrowserLeakLedger).toBeUndefined();
  });

  it("exposes enrichment policy contracts from its Node-safe subpath", async () => {
    const enrichment = await import("@laugh-tale-island/core/enrichment");
    expect(typeof enrichment.createPlaceSearchQuery).toBe("function");
    expect(typeof enrichment.createPlaceResolutionProvenance).toBe("function");
  });
});
