import { act, cleanup, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useVisibleMapLayout } from "../src/use-visible-map-layout.js";

let nextFrameId: number;
let pendingFrames: Map<number, FrameRequestCallback>;
let visualViewport: VisualViewportDouble;
let safeInsets: {
  top: string;
  right: string;
  bottom: string;
  left: string;
};

class ControllableResizeObserver implements ResizeObserver {
  static instances: ControllableResizeObserver[] = [];

  readonly observed = new Set<Element>();
  readonly observe = vi.fn((element: Element) => this.observed.add(element));
  readonly unobserve = vi.fn((element: Element) => this.observed.delete(element));
  readonly disconnect = vi.fn(() => this.observed.clear());

  constructor(readonly callback: ResizeObserverCallback) {
    ControllableResizeObserver.instances.push(this);
  }

  trigger(): void {
    this.callback([], this);
  }
}

class VisualViewportDouble extends EventTarget {
  readonly addEventListener = vi.fn(
    (...args: Parameters<EventTarget["addEventListener"]>) =>
      super.addEventListener(...args),
  );
  readonly removeEventListener = vi.fn(
    (...args: Parameters<EventTarget["removeEventListener"]>) =>
      super.removeEventListener(...args),
  );

  constructor(
    public width: number,
    public height: number,
  ) {
    super();
  }
}

class MediaQueryListDouble extends EventTarget {
  readonly media = "(prefers-reduced-motion: reduce)";
  readonly onchange = null;
  readonly addEventListener = vi.fn(
    (...args: Parameters<EventTarget["addEventListener"]>) =>
      super.addEventListener(...args),
  );
  readonly removeEventListener = vi.fn(
    (...args: Parameters<EventTarget["removeEventListener"]>) =>
      super.removeEventListener(...args),
  );

  constructor(public matches: boolean) {
    super();
  }

  setMatches(matches: boolean): void {
    this.matches = matches;
    this.dispatchEvent(new Event("change"));
  }
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

function elementAt(bounds: DOMRect): HTMLElement {
  const element = document.createElement("div");
  element.getBoundingClientRect = vi.fn(() => bounds);
  document.body.append(element);
  return element;
}

function flushAnimationFrames(time = 16): void {
  const callbacks = [...pendingFrames.values()];
  pendingFrames.clear();
  act(() => {
    for (const callback of callbacks) callback(time);
  });
}

beforeEach(() => {
  nextFrameId = 1;
  pendingFrames = new Map();
  ControllableResizeObserver.instances = [];
  visualViewport = new VisualViewportDouble(360, 700);
  safeInsets = { top: "0px", right: "0px", bottom: "0px", left: "0px" };
  vi.stubGlobal("ResizeObserver", ControllableResizeObserver);
  vi.stubGlobal("visualViewport", visualViewport);
  vi.stubGlobal("matchMedia", undefined);
  vi.stubGlobal(
    "getComputedStyle",
    vi.fn((element: Element) => {
      if (element.getAttribute("aria-hidden") === "true") {
        return {
          paddingTop: safeInsets.top,
          paddingRight: safeInsets.right,
          paddingBottom: safeInsets.bottom,
          paddingLeft: safeInsets.left,
        } as CSSStyleDeclaration;
      }
      return {} as CSSStyleDeclaration;
    }),
  );
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      const id = nextFrameId;
      nextFrameId += 1;
      pendingFrames.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => pendingFrames.delete(id)),
  );
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("useVisibleMapLayout", () => {
  it("keeps ref callbacks stable and unregisters replaced elements", () => {
    const { result, rerender } = renderHook(() => useVisibleMapLayout());
    const observer = ControllableResizeObserver.instances[0];
    const mapRef = result.current.mapViewportRef;
    const headerRef = result.current.occlusionRef("header");

    rerender();

    expect(result.current.mapViewportRef).toBe(mapRef);
    expect(result.current.occlusionRef("header")).toBe(headerRef);
    expect(result.current.occlusionRef("sheet")).not.toBe(headerRef);

    const map = elementAt(rectangle(0, 0, 390, 844));
    const oldHeader = elementAt(rectangle(0, 0, 390, 64));
    const newHeader = elementAt(rectangle(0, 0, 390, 72));
    act(() => {
      mapRef(map);
      headerRef(oldHeader);
      headerRef(newHeader);
    });

    expect(observer?.unobserve).toHaveBeenCalledWith(oldHeader);
    expect(observer?.observed).toEqual(new Set([map, newHeader]));

    act(() => {
      headerRef(null);
    });

    expect(observer?.unobserve).toHaveBeenCalledWith(newHeader);
    expect(observer?.observed).toEqual(new Set([map]));
  });

  it("publishes clipped map-relative rectangles in canonical source-independent order", () => {
    const { result } = renderHook(() => useVisibleMapLayout());
    const map = elementAt(rectangle(100, 200, 390, 844));
    const header = elementAt(rectangle(80, 180, 450, 80));
    const sheet = elementAt(rectangle(100, 800, 390, 300));
    const rail = elementAt(rectangle(50, 200, 120, 844));
    const refs = {
      header: result.current.occlusionRef("header"),
      sheet: result.current.occlusionRef("sheet"),
      rail: result.current.occlusionRef("rail"),
    };

    act(() => {
      result.current.mapViewportRef(map);
      refs.sheet(sheet);
      refs.header(header);
      refs.rail(rail);
    });
    flushAnimationFrames();

    expect(result.current.layout).toEqual({
      viewport: { width: 390, height: 844 },
      occlusions: [
        { x: 0, y: 0, width: 70, height: 844 },
        { x: 0, y: 0, width: 390, height: 60 },
        { x: 0, y: 600, width: 390, height: 244 },
      ],
      usableRegion: { x: 70, y: 60, width: 320, height: 540 },
      edgeInsets: { top: 60, right: 0, bottom: 244, left: 70 },
    });
    expect(result.current.revision).toBe(1);
    const firstLayout = result.current.layout;

    act(() => {
      refs.header(null);
      refs.sheet(null);
      refs.rail(null);
      refs.rail(rail);
      refs.header(header);
      refs.sheet(sheet);
    });
    flushAnimationFrames();

    expect(result.current.layout).toBe(firstLayout);
    expect(result.current.revision).toBe(1);
  });

  it("measures once for each observer, window, and visual-viewport signal", () => {
    const { result } = renderHook(() => useVisibleMapLayout());
    const map = document.createElement("div");
    const readMapRect = vi.fn(() => rectangle(0, 0, 390, 844));
    map.getBoundingClientRect = readMapRect;
    document.body.append(map);
    act(() => {
      result.current.mapViewportRef(map);
    });
    flushAnimationFrames();
    const observer = ControllableResizeObserver.instances[0];

    const signals = [
      () => observer?.trigger(),
      () => {
        window.dispatchEvent(new Event("resize"));
      },
      () => {
        visualViewport.dispatchEvent(new Event("resize"));
      },
      () => {
        visualViewport.dispatchEvent(new Event("scroll"));
      },
    ];
    for (const signal of signals) {
      act(signal);
      expect(pendingFrames).toHaveLength(1);
      flushAnimationFrames();
    }

    expect(readMapRect).toHaveBeenCalledTimes(5);
  });

  it("coalesces repeated signals into one layout read and one material publication", () => {
    let mapBounds = rectangle(0, 0, 390, 844);
    const map = elementAt(mapBounds);
    const readMapRect = vi.fn(() => mapBounds);
    map.getBoundingClientRect = readMapRect;
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useVisibleMapLayout();
    });
    act(() => {
      result.current.mapViewportRef(map);
    });
    flushAnimationFrames();
    const observer = ControllableResizeObserver.instances[0];
    readMapRect.mockClear();
    renders = 0;
    mapBounds = rectangle(0, 0, 391, 844);

    act(() => {
      observer?.trigger();
      observer?.trigger();
      window.dispatchEvent(new Event("resize"));
      visualViewport.dispatchEvent(new Event("resize"));
      visualViewport.dispatchEvent(new Event("scroll"));
    });

    expect(pendingFrames).toHaveLength(1);
    expect(readMapRect).not.toHaveBeenCalled();
    flushAnimationFrames();
    expect(readMapRect).toHaveBeenCalledTimes(1);
    expect(result.current.revision).toBe(2);
    expect(renders).toBe(1);
  });

  it("preserves layout identity below one pixel and publishes at one pixel", () => {
    let mapBounds = rectangle(0, 0, 390, 844);
    const map = elementAt(mapBounds);
    map.getBoundingClientRect = vi.fn(() => mapBounds);
    const { result } = renderHook(() => useVisibleMapLayout());
    act(() => {
      result.current.mapViewportRef(map);
    });
    flushAnimationFrames();
    const firstLayout = result.current.layout;
    const observer = ControllableResizeObserver.instances[0];

    mapBounds = rectangle(0, 0, 390.999, 844);
    act(() => observer?.trigger());
    flushAnimationFrames();
    expect(result.current.layout).toBe(firstLayout);
    expect(result.current.revision).toBe(1);

    mapBounds = rectangle(0, 0, 391, 844);
    act(() => observer?.trigger());
    flushAnimationFrames();
    expect(result.current.layout).not.toBe(firstLayout);
    expect(result.current.layout?.viewport.width).toBe(391);
    expect(result.current.revision).toBe(2);
  });

  it.each([
    {
      name: "compact 320 by 568 map",
      map: rectangle(20, 30, 320, 568),
      occlusion: rectangle(20, 430, 320, 200),
      expected: { x: 0, y: 0, width: 320, height: 400 },
    },
    {
      name: "390 by 844 map with a partial desktop rail",
      map: rectangle(100, 50, 390, 844),
      occlusion: rectangle(400, 50, 140, 400),
      expected: { x: 0, y: 0, width: 300, height: 844 },
    },
  ])("keeps $name geometry finite", ({ map: mapRect, occlusion, expected }) => {
    const { result } = renderHook(() => useVisibleMapLayout());
    act(() => {
      result.current.mapViewportRef(elementAt(mapRect));
      result.current.occlusionRef("surface")(elementAt(occlusion));
    });
    flushAnimationFrames();

    expect(result.current.layout?.usableRegion).toEqual(expected);
    expect(
      Object.values(result.current.layout?.edgeInsets ?? {}).every(Number.isFinite),
    ).toBe(true);
  });

  it("publishes asymmetric safe insets and browser viewport separately from the map", () => {
    safeInsets = {
      top: "12.5px",
      right: "7px",
      bottom: "30px",
      left: "2px",
    };
    const { result } = renderHook(() => useVisibleMapLayout());
    act(() => {
      result.current.mapViewportRef(elementAt(rectangle(0, 0, 390, 844)));
    });
    flushAnimationFrames();

    expect(result.current.safeArea).toEqual({
      top: 12.5,
      right: 7,
      bottom: 30,
      left: 2,
    });
    expect(result.current.viewport).toEqual({ width: 360, height: 700 });
    expect(result.current.layout?.viewport).toEqual({ width: 390, height: 844 });
  });

  it("sanitizes safe insets and falls back per invalid visual-viewport edge", () => {
    safeInsets = {
      top: "not-a-number",
      right: "-4px",
      bottom: "Infinity",
      left: "6px",
    };
    visualViewport.width = Number.NaN;
    visualViewport.height = 640;
    vi.stubGlobal("innerWidth", 1024);
    vi.stubGlobal("innerHeight", 768);
    const { result } = renderHook(() => useVisibleMapLayout());
    flushAnimationFrames();

    expect(result.current.safeArea).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 6,
    });
    expect(result.current.viewport).toEqual({ width: 1024, height: 640 });
  });

  it("uses only a hidden four-edge safe-area probe and removes all resources", () => {
    const addWindowListener = vi.spyOn(window, "addEventListener");
    const removeWindowListener = vi.spyOn(window, "removeEventListener");
    const stylePrototype = Object.getPrototypeOf(
      document.createElement("div").style,
    ) as CSSStyleDeclaration;
    const paddingTop = vi.spyOn(stylePrototype, "paddingTop", "set");
    const paddingRight = vi.spyOn(stylePrototype, "paddingRight", "set");
    const paddingBottom = vi.spyOn(stylePrototype, "paddingBottom", "set");
    const paddingLeft = vi.spyOn(stylePrototype, "paddingLeft", "set");
    const { result, unmount } = renderHook(() => useVisibleMapLayout());
    const observer = ControllableResizeObserver.instances[0];
    const map = elementAt(rectangle(0, 0, 390, 844));
    const sheet = elementAt(rectangle(0, 600, 390, 244));
    act(() => {
      result.current.mapViewportRef(map);
      result.current.occlusionRef("sheet")(sheet);
    });
    flushAnimationFrames();

    const probe = document.body.querySelector<HTMLElement>("[aria-hidden='true']");
    expect(probe).not.toBeNull();
    expect(probe?.getAttributeNames()).toEqual(["aria-hidden", "style"]);
    expect(
      Array.from(
        { length: probe!.style.length },
        (_, index) => probe!.style.item(index),
      ).sort(),
    ).toEqual([
      "height",
      "inset",
      "overflow",
      "pointer-events",
      "position",
      "visibility",
      "width",
    ]);
    expect(paddingTop).toHaveBeenCalledWith("env(safe-area-inset-top)");
    expect(paddingRight).toHaveBeenCalledWith("env(safe-area-inset-right)");
    expect(paddingBottom).toHaveBeenCalledWith("env(safe-area-inset-bottom)");
    expect(paddingLeft).toHaveBeenCalledWith("env(safe-area-inset-left)");
    expect({
      position: probe?.style.position,
      inset: probe?.style.inset,
      width: probe?.style.width,
      height: probe?.style.height,
      overflow: probe?.style.overflow,
      visibility: probe?.style.visibility,
      pointerEvents: probe?.style.pointerEvents,
    }).toEqual({
      position: "fixed",
      inset: "0 auto auto 0",
      width: "0px",
      height: "0px",
      overflow: "hidden",
      visibility: "hidden",
      pointerEvents: "none",
    });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    const pendingId = [...pendingFrames.keys()][0];
    unmount();

    const windowResizeRegistration = addWindowListener.mock.calls.find(
      ([type]) => type === "resize",
    );
    expect(observer?.disconnect).toHaveBeenCalledOnce();
    expect(removeWindowListener).toHaveBeenCalledWith(
      "resize",
      windowResizeRegistration?.[1],
    );
    expect(visualViewport.removeEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    );
    expect(visualViewport.removeEventListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
    );
    expect(cancelAnimationFrame).toHaveBeenCalledWith(pendingId);
    expect(probe?.isConnected).toBe(false);
  });

  it("defaults reduced motion to false without browser matchMedia", () => {
    expect(renderToString(<ReducedMotionProbe />)).toContain("data-reduced=\"false\"");
    const { result } = renderHook(() => useVisibleMapLayout());
    expect(result.current.reducedMotion).toBe(false);
  });

  it("tracks reduced-motion changes and obtains a fresh query on remount", () => {
    const firstQuery = new MediaQueryListDouble(true);
    const secondQuery = new MediaQueryListDouble(false);
    const matchMedia = vi
      .fn()
      .mockReturnValueOnce(firstQuery)
      .mockReturnValueOnce(secondQuery);
    vi.stubGlobal("matchMedia", matchMedia);
    const first = renderHook(() => useVisibleMapLayout());

    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    expect(first.result.current.reducedMotion).toBe(true);
    act(() => firstQuery.setMatches(false));
    expect(first.result.current.reducedMotion).toBe(false);
    act(() => firstQuery.setMatches(true));
    expect(first.result.current.reducedMotion).toBe(true);
    first.unmount();
    expect(firstQuery.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );

    const second = renderHook(() => useVisibleMapLayout());
    expect(second.result.current.reducedMotion).toBe(false);
    expect(matchMedia).toHaveBeenCalledTimes(2);
  });
});

function ReducedMotionProbe() {
  const { reducedMotion } = useVisibleMapLayout();
  return <span data-reduced={String(reducedMotion)} />;
}
