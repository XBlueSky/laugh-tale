import { act, cleanup, render } from "@testing-library/react";
import { useCallback, useMemo } from "react";
import {
  resolveFitCameraIntent,
  resolveFocusCameraIntent,
  type CameraIntent,
  type CameraSnapshot,
  type Coordinates,
} from "@laugh-tale-island/core";
import type {
  MapAdapterV2,
  MapMountConfig,
  MapPresentationV2,
} from "@laugh-tale-island/core/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMapAdapterLifecycle } from "../src/use-map-adapter-lifecycle.js";
import { useVisibleMapLayout } from "../src/use-visible-map-layout.js";

class RecordingMapAdapter implements MapAdapterV2 {
  readonly mountCalls: HTMLElement[] = [];
  readonly cameraIntents: CameraIntent[] = [];
  readonly presentations: MapPresentationV2[] = [];
  readonly operations: string[] = [];
  destroyCalls = 0;

  mount(element: HTMLElement): Promise<void> {
    this.mountCalls.push(element);
    this.operations.push("mount");
    return Promise.resolve();
  }

  render(presentation: MapPresentationV2): void {
    this.presentations.push(presentation);
    this.operations.push("render");
  }

  applyCameraIntent(intent: CameraIntent): void {
    this.cameraIntents.push(intent);
    this.operations.push("camera");
  }

  getCameraSnapshot(): CameraSnapshot | null {
    return { zoom: 16 };
  }

  setUserLocation(): void {}

  destroy(): void {
    this.destroyCalls += 1;
  }
}

class ControllableResizeObserver implements ResizeObserver {
  static instances: ControllableResizeObserver[] = [];

  readonly observed = new Set<Element>();

  constructor(readonly callback: ResizeObserverCallback) {
    ControllableResizeObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.observed.add(element);
  }

  unobserve(element: Element): void {
    this.observed.delete(element);
  }

  disconnect(): void {
    this.observed.clear();
  }

  trigger(): void {
    this.callback([], this);
  }
}

const mountConfig: MapMountConfig = {
  events: {
    onMarkerSelect: vi.fn(),
    onRouteSelect: vi.fn(),
    onUnavailable: vi.fn(),
  },
  visualProfile: {
    id: "contract-profile",
    basemap: {
      mode: "neutral",
      density: "low",
      contrast: "standard",
      poi: "minimal",
      stationLabels: "legible",
      palette: {
        geometry: "#ffffff",
        label: "#111111",
        labelStroke: "#ffffff",
        water: "#dbeafe",
        park: "#dcfce7",
        road: "#e5e7eb",
      },
    },
    routeStyle: () => null,
  },
  createMarkerContent: () => {
    const element = document.createElement("button");
    return { element, update: () => undefined, dispose: () => element.remove() };
  },
  createUserLocationContent: () => {
    const element = document.createElement("span");
    return { element, update: () => undefined, dispose: () => element.remove() };
  },
};

const initialPresentation: MapPresentationV2 = { markers: [], routes: [] };
const selectedPresentation: MapPresentationV2 = {
  markers: [
    {
      ownerId: "owner-selected",
      label: "Synthetic stop",
      coordinates: { lat: 11, lng: 21 },
      markerMode: "numbered",
      displayIndex: 1,
      sourceKind: "synthetic",
      timing: "suggested",
      states: ["selected"],
    },
  ],
  routes: [],
};

interface Selection {
  intentId: string;
  coordinate: Coordinates;
}

interface HarnessProps {
  adapter: RecordingMapAdapter;
  dayIntentId: string;
  presentation: MapPresentationV2;
  selection: Selection | null;
}

function Harness({ adapter, dayIntentId, presentation, selection }: HarnessProps) {
  const visible = useVisibleMapLayout();
  const createAdapter = useMemo(() => () => adapter, [adapter]);
  const context = visible.layout === null
    ? null
    : {
        intentId: selection?.intentId ?? dayIntentId,
        layout: visible.layout,
        reducedMotion: visible.reducedMotion,
      };
  const cameraIntent = context === null
    ? null
    : selection === null
      ? resolveFitCameraIntent(
          context,
          { points: [{ lat: 10, lng: 20 }], paths: [] },
        )
      : resolveFocusCameraIntent(
          context,
          selection.coordinate,
          adapter.getCameraSnapshot(),
        );
  const lifecycle = useMapAdapterLifecycle({
    createAdapter,
    mountConfig,
    presentation,
    cameraIntent,
    layout: visible.layout,
    userLocation: null,
    development: false,
  });
  const mapRef = useCallback((element: HTMLElement | null): void => {
    visible.mapViewportRef(element);
    lifecycle.mapRef(element);
  }, [lifecycle.mapRef, visible.mapViewportRef]);

  return (
    <div
      data-layout-revision={visible.revision}
      data-region="map"
      data-usable-height={visible.layout?.usableRegion.height ?? ""}
      ref={mapRef}
    >
      <div data-region="header" ref={visible.occlusionRef("header")} />
      <div data-region="sheet" ref={visible.occlusionRef("sheet")} />
    </div>
  );
}

function rectangle(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    x: left,
    y: top,
    width,
    height,
    top,
    right: left + width,
    bottom: top + height,
    left,
    toJSON: () => ({}),
  };
}

let frames: Map<number, FrameRequestCallback>;

function flushFrames(time = 16): void {
  const callbacks = [...frames.values()];
  frames.clear();
  act(() => {
    for (const callback of callbacks) callback(time);
  });
}

beforeEach(() => {
  let frameId = 0;
  frames = new Map();
  ControllableResizeObserver.instances = [];
  vi.stubGlobal("ResizeObserver", ControllableResizeObserver);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => frames.delete(id)),
  );
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("Phase 02 choreography and camera integration", () => {
  it("composes measured geometry, semantic focus, and presentation without replacing the adapter", async () => {
    const adapter = new RecordingMapAdapter();
    const firstId = "day-synthetic";
    const secondId = "list-owner-selected";
    const props: HarnessProps = {
      adapter,
      dayIntentId: firstId,
      presentation: initialPresentation,
      selection: null,
    };
    const view = render(<Harness {...props} />);
    const map = view.container.querySelector<HTMLElement>("[data-region='map']");
    const header = view.container.querySelector<HTMLElement>("[data-region='header']");
    const sheet = view.container.querySelector<HTMLElement>("[data-region='sheet']");
    expect(map).not.toBeNull();
    expect(header).not.toBeNull();
    expect(sheet).not.toBeNull();

    const mapRect = rectangle(0, 0, 390, 844);
    let headerRect = rectangle(0, 0, 390, 64);
    let sheetRect = rectangle(0, 600, 390, 244);
    map!.getBoundingClientRect = vi.fn(() => mapRect);
    header!.getBoundingClientRect = vi.fn(() => headerRect);
    sheet!.getBoundingClientRect = vi.fn(() => sheetRect);

    await act(async () => {
      await Promise.resolve();
    });
    expect(adapter.mountCalls).toEqual([map]);
    expect(adapter.presentations).toEqual([initialPresentation]);
    expect(adapter.cameraIntents).toEqual([]);

    flushFrames();
    expect(map).toHaveAttribute("data-layout-revision", "1");
    expect(map).toHaveAttribute("data-usable-height", "536");
    expect(adapter.cameraIntents).toEqual([
      expect.objectContaining({
        intentId: firstId,
        kind: "fit",
        transition: "animate",
      }),
    ]);
    expect(adapter.operations.slice(0, 3)).toEqual(["mount", "render", "camera"]);

    headerRect = rectangle(0, 0, 390, 80);
    sheetRect = rectangle(0, 560, 390, 284);
    const observer = ControllableResizeObserver.instances[0];
    act(() => {
      observer.trigger();
      observer.trigger();
    });
    expect(frames.size).toBe(1);
    flushFrames();
    expect(map).toHaveAttribute("data-layout-revision", "2");
    expect(map).toHaveAttribute("data-usable-height", "480");
    expect(frames.size).toBe(1);
    flushFrames();
    expect(adapter.cameraIntents).toEqual([
      expect.objectContaining({
        intentId: firstId,
        kind: "fit",
        transition: "animate",
      }),
      expect.objectContaining({
        intentId: firstId,
        kind: "fit",
        transition: "immediate",
        usableRegion: { x: 0, y: 80, width: 390, height: 480 },
        edgeInsets: { top: 80, right: 0, bottom: 284, left: 0 },
      }),
    ]);

    headerRect = rectangle(0, 0, 390, 72);
    sheetRect = rectangle(0, 620, 390, 224);
    act(() => observer.trigger());
    flushFrames();
    expect(map).toHaveAttribute("data-layout-revision", "3");
    expect(map).toHaveAttribute("data-usable-height", "548");
    expect(frames.size).toBe(1);
    const staleFitReframe = [...frames.values()][0];

    view.rerender(
      <Harness
        {...props}
        presentation={selectedPresentation}
        selection={{ intentId: secondId, coordinate: { lat: 11, lng: 21 } }}
      />,
    );
    expect(frames.size).toBe(0);
    expect(adapter.cameraIntents.at(-1)).toEqual(
      expect.objectContaining({
        intentId: secondId,
        kind: "focus",
        transition: "animate",
        coordinate: { lat: 11, lng: 21 },
        targetZoom: 16,
        usableRegion: { x: 0, y: 72, width: 390, height: 548 },
      }),
    );
    expect(adapter.presentations).toEqual([
      initialPresentation,
      selectedPresentation,
    ]);
    act(() => staleFitReframe(32));
    expect(adapter.cameraIntents).toHaveLength(3);
    expect(adapter.mountCalls).toHaveLength(1);
    expect(adapter.destroyCalls).toBe(0);

    view.unmount();
    expect(adapter.destroyCalls).toBe(1);
    expect(frames.size).toBe(0);
  });
});
