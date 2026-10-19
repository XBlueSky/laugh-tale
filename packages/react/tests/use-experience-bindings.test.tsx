import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveSheetGeometry,
  type CandidateGroup,
  type ExperienceCameraRequest,
  type MapLayoutSnapshot,
  type ProviderUnavailableResult,
  type SheetGeometry,
} from "@laugh-tale-island/core";
import type {
  MapPresentationV2,
  MapVisualProfile,
  MarkerContentFactory,
  UserLocationContentFactory,
} from "@laugh-tale-island/core/browser";

const boundaries = vi.hoisted(() => ({
  layout: vi.fn(),
  lifecycle: vi.fn(),
  sheet: vi.fn(),
  focus: vi.fn(),
}));

vi.mock("../src/use-visible-map-layout.js", () => ({
  useVisibleMapLayout: boundaries.layout,
}));
vi.mock("../src/use-map-adapter-lifecycle.js", () => ({
  useMapAdapterLifecycle: boundaries.lifecycle,
}));
vi.mock("../src/use-itinerary-sheet.js", () => ({
  useItinerarySheet: boundaries.sheet,
}));
vi.mock("../src/use-owner-focus-registry.js", () => ({
  useOwnerFocusRegistry: boundaries.focus,
}));

import {
  useExperienceBindings,
  type UseExperienceBindingsInput,
} from "../src/use-experience-bindings.js";
import type { UseItinerarySheetOptions } from "../src/use-itinerary-sheet.js";
import type { UseMapAdapterLifecycleInput } from "../src/use-map-adapter-lifecycle.js";

const LAYOUT: MapLayoutSnapshot = {
  viewport: { width: 400, height: 800 },
  occlusions: [],
  usableRegion: { x: 0, y: 0, width: 400, height: 620 },
  edgeInsets: { top: 0, right: 0, bottom: 180, left: 0 },
};

const visualProfile: MapVisualProfile = {
  id: "binding-profile",
  basemap: {
    mode: "neutral",
    density: "low",
    contrast: "soft",
    poi: "minimal",
    stationLabels: "hidden",
    palette: {
      geometry: "gray",
      label: "black",
      labelStroke: "white",
      water: "blue",
      park: "green",
      road: "gray",
    },
  },
  routeStyle: () => null,
};

const createMarkerContent: MarkerContentFactory = () => ({
  element: document.createElement("div"),
  update() {},
  dispose() {},
});
const createUserLocationContent: UserLocationContentFactory = () => ({
  element: document.createElement("div"),
  update() {},
  dispose() {},
});

type DaylessCameraRequest = ExperienceCameraRequest extends infer Request
  ? Request extends ExperienceCameraRequest
    ? Omit<Request, "dayId">
    : never
  : never;

function cameraRequest(request: DaylessCameraRequest): ExperienceCameraRequest {
  switch (request.kind) {
    case "fit-day":
    case "fit-candidate":
    case "focus-owner":
    case "focus-route":
    case "recenter-user":
      return { ...request, dayId: "day-a" };
  }
}

describe("useExperienceBindings", () => {
  let layoutMapRef: ReturnType<typeof vi.fn>;
  let lifecycleMapRef: ReturnType<typeof vi.fn>;
  let fallbackSurfaceRef: ReturnType<typeof vi.fn>;
  let occlusionCallback: ReturnType<typeof vi.fn>;
  let nodeCallback: ReturnType<typeof vi.fn>;
  let routeCallback: ReturnType<typeof vi.fn>;
  let dialogCallback: ReturnType<typeof vi.fn>;
  let disclosureCallback: ReturnType<typeof vi.fn>;
  let namedRefs: Map<string, ReturnType<typeof vi.fn>>;
  let restoreTrigger: ReturnType<typeof vi.fn>;
  let sheetGeometry: SheetGeometry | null;
  let layout: MapLayoutSnapshot | null;
  let lifecycleInput: UseMapAdapterLifecycleInput | undefined;

  beforeEach(() => {
    layoutMapRef = vi.fn();
    lifecycleMapRef = vi.fn();
    fallbackSurfaceRef = vi.fn();
    occlusionCallback = vi.fn();
    nodeCallback = vi.fn();
    routeCallback = vi.fn();
    dialogCallback = vi.fn();
    disclosureCallback = vi.fn();
    namedRefs = new Map([
      ["occlusion:sheet", occlusionCallback], ["node:node-a", nodeCallback],
      ["route:walk", routeCallback], ["dialog:group-a", dialogCallback],
      ["disclosure:group-a", disclosureCallback],
    ]);
    const namedRef = (kind: string, id: string) => {
      const key = `${kind}:${id}`;
      if (!namedRefs.has(key)) namedRefs.set(key, vi.fn());
      return namedRefs.get(key)!;
    };
    restoreTrigger = vi.fn();
    sheetGeometry = resolveSheetGeometry({
      collapsedHeight: 0,
      halfHeight: 0,
      expandedHeight: 0,
    });
    layout = LAYOUT;
    boundaries.layout.mockImplementation(() => ({
      layout,
      revision: 1,
      viewport: LAYOUT.viewport,
      safeArea: LAYOUT.edgeInsets,
      reducedMotion: false,
      mapViewportRef: layoutMapRef,
      occlusionRef: (id: string) => namedRef("occlusion", id),
    }));
    boundaries.focus.mockImplementation(() => ({
      nodeRef: (id: string) => namedRef("node", id),
      routeRef: (id: string) => namedRef("route", id),
      dialogRef: (id: string) => namedRef("dialog", id),
      disclosureTriggerRef: (id: string) => namedRef("disclosure", id),
      fallbackSurfaceRef,
      focus: vi.fn(),
      restoreTrigger,
      cancelPendingFocus: vi.fn(),
    }));
    boundaries.sheet.mockImplementation((input: UseItinerarySheetOptions) => {
      sheetGeometry = input.geometry;
      return {
        snap: input.snap,
        dragging: false,
        height: sheetGeometry?.half ?? null,
        ceiling: sheetGeometry?.ceiling ?? null,
        setSnap: vi.fn(),
        step: vi.fn(),
        getSheetProps: vi.fn(() =>
          input.geometry === null ? unmeasuredSurfaceProps : surfaceProps,
        ),
        getHandleProps: vi.fn(() => handleProps),
      };
    });
    boundaries.lifecycle.mockImplementation(
      (input: UseMapAdapterLifecycleInput) => {
        lifecycleInput = input;
        return {
          mapRef: lifecycleMapRef,
          status: { kind: "ready", attempt: 0 },
          retry: vi.fn(),
          getCameraSnapshot: vi.fn(() => ({ zoom: 17 })),
        };
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const surfaceProps = {
    ref: vi.fn(),
    style: { height: "156px" },
    "data-dragging": "false" as const,
    "data-snap": "half" as const,
  };
  const unmeasuredSurfaceProps = {
    ref: vi.fn(),
    style: {},
    "data-dragging": "false" as const,
    "data-snap": "half" as const,
  };
  const handleProps = {
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
    onPointerCancel: vi.fn(),
    onLostPointerCapture: vi.fn(),
    onKeyDown: vi.fn(),
    "aria-keyshortcuts": "ArrowUp ArrowDown Home End",
  };
  const presentation: MapPresentationV2 = {
    markers: [
      marker("node-a", 11),
      marker("candidate-a", 21),
      marker("candidate-b", 22),
      marker("foreign-candidate", 29),
    ],
    routes: [
      route("walk", "walking", 31),
      route("flight", "flight", 41),
      route("other", "transit", 51),
    ],
  };
  const candidateGroups: readonly CandidateGroup[] = [
    {
      id: "group-a",
      parentNodeId: "node-a",
      mode: "single",
      defaultOptionId: "candidate-a",
      options: [
        { id: "candidate-a", title: "Candidate A" },
        { id: "candidate-b", title: "Candidate B" },
      ],
    },
  ];

  function input(
    request: ExperienceCameraRequest | null = null,
  ): UseExperienceBindingsInput {
    return {
      ownershipKey: "trip-a:day-a",
      dayId: "day-a",
      sheetSnap: "half" as const,
      cameraRequest: request,
      presentation,
      candidateGroups,
      visualProfile,
      createMarkerContent,
      createUserLocationContent,
      createAdapter: vi.fn(),
      userLocation: { lat: 61, lng: 161 },
      development: false,
      onSnapChange: vi.fn(),
      onMarkerSelect: vi.fn(),
      onRouteSelect: vi.fn(),
      onFailure: vi.fn(),
    };
  }

  function mountedLifecycleInput(): UseMapAdapterLifecycleInput {
    if (lifecycleInput === undefined) {
      throw new Error("lifecycle input was not captured");
    }
    return lifecycleInput;
  }

  it("fans the public map host in stable owner order and delegates named refs and props unchanged", () => {
    const order: string[] = [];
    layoutMapRef.mockImplementation(() => order.push("layout"));
    lifecycleMapRef.mockImplementation(() => order.push("lifecycle"));
    fallbackSurfaceRef.mockImplementation(() => order.push("focus"));
    const hook = renderHook(useExperienceBindings, { initialProps: input() });
    const mapRef = hook.result.current.bindings.layout.mapViewportRef;
    const host = document.createElement("div");

    act(() => {
      mapRef(host);
    });
    expect(order).toEqual(["layout", "lifecycle", "focus"]);
    order.length = 0;
    act(() => {
      mapRef(null);
    });
    expect(order).toEqual(["layout", "lifecycle", "focus"]);
    hook.rerender(input());
    expect(hook.result.current.bindings.layout.mapViewportRef).toBe(mapRef);

    expect(hook.result.current.bindings.layout.occlusionRef("sheet")).toBe(
      occlusionCallback,
    );
    expect(hook.result.current.bindings.owners.nodeRef("node-a")).toBe(
      nodeCallback,
    );
    expect(hook.result.current.bindings.owners.routeRef("walk")).toBe(
      routeCallback,
    );
    expect(hook.result.current.bindings.focus.dialogRef("group-a")).toBe(
      dialogCallback,
    );
    expect(
      hook.result.current.bindings.focus.disclosureTriggerRef("group-a"),
    ).toBe(disclosureCallback);

    const { layout: layoutBindings, owners, focus } = hook.result.current.bindings;
    for (const [kind, refs] of [
      ["occlusion", [layoutBindings.occlusionRef("first"), layoutBindings.occlusionRef("second")]],
      ["node", [owners.nodeRef("first"), owners.nodeRef("second")]],
      ["route", [owners.routeRef("first"), owners.routeRef("second")]],
      ["dialog", [focus.dialogRef("first"), focus.dialogRef("second")]],
      ["disclosure", [focus.disclosureTriggerRef("first"), focus.disclosureTriggerRef("second")]],
    ] as const) {
      expect(refs[0]).not.toBe(refs[1]);
      const first = document.createElement("button");
      const second = document.createElement("button");
      act(() => { refs[0](first); refs[1](second); refs[0](null); refs[1](null); });
      expect(namedRefs.get(`${kind}:first`)?.mock.calls).toEqual([[first], [null]]);
      expect(namedRefs.get(`${kind}:second`)?.mock.calls).toEqual([[second], [null]]);
    }

    expect(hook.result.current.bindings.sheet.getSurfaceProps()).toBe(
      unmeasuredSurfaceProps,
    );
    expect(
      hook.result.current.bindings.sheet.getSurfaceProps().style,
    ).toEqual({});
    expect(hook.result.current.bindings.sheet.getHandleProps()).toEqual({});
    act(() =>
      hook.result.current.bindings.sheet.setMeasuredGeometry({
        collapsedHeight: 77.4,
        halfHeight: 155.6,
        expandedHeight: 411.2,
      }),
    );
    expect(sheetGeometry).toEqual({
      collapsed: 77,
      half: 156,
      expanded: 411,
      ceiling: 411,
    });
    expect(hook.result.current.bindings.sheet.getSurfaceProps()).toBe(
      surfaceProps,
    );
    expect(hook.result.current.bindings.sheet.getHandleProps()).toBe(
      handleProps,
    );
    act(() =>
      hook.result.current.bindings.sheet.setMeasuredGeometry({
        collapsedHeight: 91,
        halfHeight: 201,
        expandedHeight: 501,
      }),
    );
    expect(sheetGeometry).toEqual({
      collapsed: 91,
      half: 201,
      expanded: 501,
      ceiling: 501,
    });
  });

  it("forwards focus fallback and presentation factories without substitution", () => {
    const props = input();
    const hook = renderHook(useExperienceBindings, { initialProps: props });
    const fallback = { slot: "route" as const, ownerId: "walk" };

    act(() => hook.result.current.bindings.focus.restoreTrigger("group-a"));
    act(() =>
      hook.result.current.bindings.focus.restoreTrigger("group-a", fallback),
    );
    expect(restoreTrigger.mock.calls).toEqual([
      ["group-a", undefined],
      ["group-a", fallback],
    ]);

    const mounted = mountedLifecycleInput();
    expect(mounted.mountConfig.visualProfile).toBe(visualProfile);
    expect(mounted.mountConfig.createMarkerContent).toBe(
      createMarkerContent,
    );
    expect(mounted.mountConfig.createUserLocationContent).toBe(
      createUserLocationContent,
    );
    act(() => {
      mounted.mountConfig.events.onMarkerSelect("node-a");
      mounted.mountConfig.events.onRouteSelect("walk");
    });
    expect(props.onMarkerSelect).toHaveBeenCalledExactlyOnceWith("node-a");
    expect(props.onRouteSelect).toHaveBeenCalledExactlyOnceWith("walk");

    const unavailable: ProviderUnavailableResult = {
      status: "unavailable",
      reason: "request-denied",
      retryable: false,
      diagnostic: "private provider detail",
    };
    act(() => {
      mounted.mountConfig.events.onUnavailable(unavailable);
    });
    expect(hook.result.current.mapUnavailable).toEqual({
      status: "unavailable",
      reason: "request-denied",
      retryable: false,
    });
    expect(JSON.stringify(hook.result.current.mapUnavailable)).not.toContain(
      "private provider detail",
    );
  });

  it("resolves every camera request from exact projected geometry", () => {
    const hook = renderHook(useExperienceBindings, {
      initialProps: input(
        cameraRequest({ kind: "fit-day", intentId: "fit-day-1" }),
      ),
    });
    expect(hook.result.current.cameraIntent).toMatchObject({
      kind: "fit",
      intentId: "fit-day-1",
      points: presentation.markers.map((entry) => entry.coordinates),
      paths: [
        presentation.routes[0]?.geometry,
        presentation.routes[2]?.geometry,
      ],
    });

    hook.rerender(
      input(
        cameraRequest({
          kind: "fit-candidate",
          groupId: "group-a",
          intentId: "fit-candidate-2",
        }),
      ),
    );
    expect(hook.result.current.cameraIntent).toMatchObject({
      kind: "fit",
      intentId: "fit-candidate-2",
      points: [
        presentation.markers[1]?.coordinates,
        presentation.markers[2]?.coordinates,
      ],
      paths: [],
    });

    hook.rerender(
      input(
        cameraRequest({
          kind: "focus-owner",
          ownerId: "node-a",
          intentId: "focus-owner-3",
        }),
      ),
    );
    expect(hook.result.current.cameraIntent).toMatchObject({
      kind: "focus",
      intentId: "focus-owner-3",
      coordinate: presentation.markers[0]?.coordinates,
      targetZoom: 17,
    });

    hook.rerender(
      input(
        cameraRequest({
          kind: "focus-route",
          routeId: "flight",
          intentId: "focus-flight-4",
        }),
      ),
    );
    expect(hook.result.current.cameraIntent).toMatchObject({
      kind: "fit",
      intentId: "focus-flight-4",
      points: [],
      paths: [presentation.routes[1]?.geometry],
    });

    hook.rerender(
      input(
        cameraRequest({ kind: "recenter-user", intentId: "recenter-5" }),
      ),
    );
    expect(hook.result.current.cameraIntent).toMatchObject({
      kind: "recenter-user",
      intentId: "recenter-5",
      coordinate: { lat: 61, lng: 161 },
    });
  });

  it("emits no intent for stale, missing, foreign, or unprojected geometry", () => {
    const cases: Array<ReturnType<typeof input>> = [
      {
        ...input(
          cameraRequest({
            kind: "focus-route",
            routeId: "quarantined-route",
            intentId: "missing-route",
          }),
        ),
      },
      input({ kind: "fit-day", dayId: "stale-day", intentId: "stale-day" }),
      input(
        cameraRequest({
          kind: "focus-owner",
          ownerId: "foreign-owner",
          intentId: "foreign-owner",
        }),
      ),
      {
        ...input(
          cameraRequest({
            kind: "fit-candidate",
            groupId: "missing-group",
            intentId: "missing-group",
          }),
        ),
      },
      {
        ...input(
          cameraRequest({
            kind: "recenter-user",
            intentId: "missing-user",
          }),
        ),
        userLocation: null,
      },
    ];
    const hook = renderHook(useExperienceBindings, {
      initialProps: cases[0] ?? input(),
    });
    for (const props of cases) {
      hook.rerender(props);
      expect(hook.result.current.cameraIntent).toBeNull();
    }
  });

  it("excludes unselected flight geometry from day bounds and focused flight intent", () => {
    const props = input(cameraRequest({ kind: "fit-day", intentId: "day-with-flight" }));
    const unselected = { ...props, presentation: { ...props.presentation, routes: props.presentation.routes.map((route) => ({ ...route, selected: false })) } };
    const hook = renderHook(useExperienceBindings, { initialProps: unselected });
    expect(hook.result.current.cameraIntent).toMatchObject({ kind: "fit", paths: [presentation.routes[0]?.geometry, presentation.routes[2]?.geometry] });
    hook.rerender({ ...unselected, cameraRequest: cameraRequest({ kind: "focus-route", routeId: "flight", intentId: "unselected-flight" }) });
    expect(hook.result.current.cameraIntent).toBeNull();
  });

  it("delegates layout revisions with the same semantic camera identity", () => {
    const props = input(
      cameraRequest({
        kind: "focus-owner",
        ownerId: "node-a",
        intentId: "stable-intent",
      }),
    );
    const hook = renderHook(useExperienceBindings, { initialProps: props });
    const firstLifecycleInput = mountedLifecycleInput();
    expect(firstLifecycleInput.cameraIntent?.intentId).toBe("stable-intent");

    layout = {
      ...LAYOUT,
      usableRegion: { x: 0, y: 0, width: 400, height: 500 },
      edgeInsets: { top: 0, right: 0, bottom: 300, left: 0 },
    };
    hook.rerender(props);
    const nextLifecycleInput = mountedLifecycleInput();
    expect(nextLifecycleInput.layout).toBe(layout);
    expect(nextLifecycleInput.cameraIntent?.intentId).toBe("stable-intent");
  });
});

function marker(ownerId: string, lat: number) {
  return {
    ownerId,
    label: ownerId,
    coordinates: { lat, lng: lat + 100 },
    markerMode: "numbered" as const,
    sourceKind: "sightseeing",
    timing: "fixed" as const,
    states: [],
  };
}

function route(
  edgeId: string,
  mode: "walking" | "transit" | "flight",
  lat: number,
) {
  return {
    edgeId,
    mode,
    source: "provider" as const,
    certainty: "confirmed" as const,
    geometry: [
      { lat, lng: lat + 100 },
      { lat: lat + 0.5, lng: lat + 100.5 },
    ],
    selected: edgeId === "flight",
  };
}
