import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SheetGeometry, SheetSnap } from "@laugh-tale-island/core";
import {
  useItinerarySheet,
  type UseItinerarySheetOptions,
} from "../src/use-itinerary-sheet.js";

const geometry: SheetGeometry = {
  collapsed: 100,
  half: 300,
  expanded: 600,
  ceiling: 600,
};

let nextFrameId = 1;
let pendingFrames: Map<number, FrameRequestCallback>;

beforeEach(() => {
  nextFrameId = 1;
  pendingFrames = new Map();
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      pendingFrames.set(frameId, callback);
      return frameId;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((frameId: number) => {
      pendingFrames.delete(frameId);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

interface HarnessProps {
  initialSnap?: SheetSnap;
  geometry?: SheetGeometry | null;
  reducedMotion?: boolean;
  renderedHeight?: number;
  presentationMaxHeight?: string;
  onSnapChange?: (snap: SheetSnap) => void;
  onRender?: (state: {
    dragging: boolean;
    height: number | null;
    ceiling: number | null;
  }) => void;
  handleUserProps?: Parameters<
    ReturnType<typeof useItinerarySheet>["getHandleProps"]
  >[0];
}

function Harness({
  initialSnap = "half",
  geometry: suppliedGeometry = geometry,
  reducedMotion,
  renderedHeight,
  presentationMaxHeight,
  onSnapChange,
  onRender,
  handleUserProps,
}: HarnessProps) {
  const [snap, setSnap] = useState<SheetSnap>(initialSnap);
  const options: UseItinerarySheetOptions = {
    snap,
    geometry: suppliedGeometry,
    onSnapChange: (next) => {
      setSnap(next);
      onSnapChange?.(next);
    },
    ...(reducedMotion === undefined ? {} : { reducedMotion }),
  };
  const sheet = useItinerarySheet(options);
  const sheetProps = sheet.getSheetProps();
  onRender?.({
    dragging: sheet.dragging,
    height: sheet.height,
    ceiling: sheet.ceiling,
  });

  return (
    <section
      aria-label="sheet"
      {...sheetProps}
      ref={(element) => {
        if (element !== null && renderedHeight !== undefined) {
          element.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            width: 320,
            height: renderedHeight,
            top: 0,
            right: 320,
            bottom: renderedHeight,
            left: 0,
            toJSON: () => ({}),
          });
        }
        sheetProps.ref(element);
      }}
      style={{
        ...sheetProps.style,
        ...(presentationMaxHeight === undefined
          ? {}
          : { maxHeight: presentationMaxHeight }),
      }}
    >
      <div
        aria-label="handle"
        data-testid="handle"
        role="separator"
        tabIndex={0}
        {...sheet.getHandleProps(handleUserProps)}
      >
        <button type="button" aria-label="nested action" />
      </div>
      <output aria-label="dragging">{sheet.dragging ? "yes" : "no"}</output>
      <output aria-label="height">{sheet.height}</output>
      <output aria-label="ceiling">{sheet.ceiling}</output>
      <button type="button" aria-label="step up" onClick={() => sheet.step(1)} />
      <button type="button" aria-label="step down" onClick={() => sheet.step(-1)} />
      <button
        type="button"
        aria-label="set collapsed"
        onClick={() => sheet.setSnap("collapsed")}
      />
    </section>
  );
}

function sheetElement(): HTMLElement {
  return screen.getByRole("region", { name: "sheet" });
}

function handle(): HTMLElement {
  return screen.getByTestId("handle");
}

function dispatchTimestampedPointer(
  type: "pointerDown" | "pointerMove" | "pointerUp",
  init: { pointerId: number; clientY: number; timeStamp: number },
): void {
  const target = handle();
  const event = createEvent[type](target, init);
  Object.defineProperty(event, "timeStamp", { value: init.timeStamp });
  fireEvent(target, event);
}

function flushAnimationFrames(time = 16): void {
  const callbacks = [...pendingFrames.values()];
  pendingFrames.clear();
  act(() => {
    for (const callback of callbacks) {
      callback(time);
    }
  });
}

function installPointerCapture(target: HTMLElement) {
  const capturedPointers = new Set<number>();
  const setPointerCapture = vi.fn((pointerId: number) => {
    capturedPointers.add(pointerId);
  });
  const hasPointerCapture = vi.fn((pointerId: number) =>
    capturedPointers.has(pointerId),
  );
  const releasePointerCapture = vi.fn((pointerId: number) => {
    capturedPointers.delete(pointerId);
  });
  Object.assign(target, {
    setPointerCapture,
    hasPointerCapture,
    releasePointerCapture,
  });
  return { setPointerCapture, hasPointerCapture, releasePointerCapture };
}

describe("useItinerarySheet", () => {
  it("exposes the actual live drag height and measured bounds to the handle", () => {
    const view = render(<Harness />);
    expect(handle()).toHaveAttribute("aria-valuemin", "100");
    expect(handle()).toHaveAttribute("aria-valuemax", "600");
    expect(handle()).toHaveAttribute("aria-valuenow", "300");
    installPointerCapture(handle());
    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 500 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 350 });
    flushAnimationFrames();
    expect(handle()).toHaveAttribute("aria-valuenow", "450");
    expect(sheetElement().style.height).toBe("450px");
    fireEvent.pointerUp(handle(), { pointerId: 1, clientY: 350 });
    expect(handle().getAttribute("aria-valuenow")).toBe(screen.getByLabelText("height").textContent);
    view.rerender(<Harness presentationMaxHeight="500px" />);
    fireEvent.pointerDown(handle(), { pointerId: 2, clientY: 500 });
    expect(handle()).toHaveAttribute("aria-valuemax", "500");
    view.rerender(<Harness geometry={{ collapsed: 200, half: 400, expanded: 700, ceiling: 700 }} />);
    expect(handle()).toHaveAttribute("aria-valuemin", "100");
    expect(handle()).toHaveAttribute("aria-valuemax", "500");
    fireEvent.pointerUp(handle(), { pointerId: 2, clientY: 500 });
    view.rerender(<Harness geometry={null} />);
    expect(handle()).not.toHaveAttribute("aria-valuenow");
    expect(handle()).not.toHaveAttribute("aria-valuemin");
    expect(handle()).not.toHaveAttribute("aria-valuemax");
  });
  it("emits no physical dimensions or interactions before geometry is measured", () => {
    const onSnapChange = vi.fn();
    render(<Harness geometry={null} onSnapChange={onSnapChange} />);

    expect(sheetElement().style.height).toBe("");
    expect(sheetElement().style.maxHeight).toBe("");
    expect(screen.getByLabelText("height")).toHaveTextContent("");
    expect(screen.getByLabelText("ceiling")).toHaveTextContent("");

    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 500 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 300 });
    expect(screen.getByLabelText("dragging")).toHaveTextContent("no");
    expect(requestAnimationFrame).not.toHaveBeenCalled();

    expect(fireEvent.keyDown(handle(), { key: "ArrowUp" })).toBe(true);
    expect(onSnapChange).not.toHaveBeenCalled();
  });

  it("settles identical release positions alike for slow and fast timestamped drags", () => {
    const slowSnapChange = vi.fn();
    const fastSnapChange = vi.fn();

    const slow = render(<Harness onSnapChange={slowSnapChange} />);
    dispatchTimestampedPointer("pointerDown", {
      pointerId: 1,
      clientY: 500,
      timeStamp: 0,
    });
    dispatchTimestampedPointer("pointerMove", {
      pointerId: 1,
      clientY: 400,
      timeStamp: 20,
    });
    dispatchTimestampedPointer("pointerUp", {
      pointerId: 1,
      clientY: 350,
      timeStamp: 220,
    });
    slow.unmount();

    render(<Harness onSnapChange={fastSnapChange} />);
    dispatchTimestampedPointer("pointerDown", {
      pointerId: 2,
      clientY: 500,
      timeStamp: 0,
    });
    dispatchTimestampedPointer("pointerMove", {
      pointerId: 2,
      clientY: 400,
      timeStamp: 90,
    });
    dispatchTimestampedPointer("pointerUp", {
      pointerId: 2,
      clientY: 350,
      timeStamp: 100,
    });

    expect(slowSnapChange).toHaveBeenLastCalledWith("half");
    expect(fastSnapChange).toHaveBeenLastCalledWith("half");
  });

  it("coalesces pointer moves into one final height commit per frame", () => {
    const renders: Array<{
      dragging: boolean;
      height: number | null;
      ceiling: number | null;
    }> = [];
    render(<Harness onRender={(state) => renders.push(state)} />);

    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 500 });
    renders.length = 0;
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 450 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 400 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 350 });

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(pendingFrames).toHaveLength(1);
    expect(renders).toEqual([]);
    expect(screen.getByLabelText("height")).toHaveTextContent("300");

    flushAnimationFrames();

    expect(renders).toEqual([{ dragging: true, height: 450, ceiling: 600 }]);
    expect(screen.getByLabelText("height")).toHaveTextContent("450");
  });

  it("cancels an unflushed frame and settles from the latest moved height", () => {
    const onSnapChange = vi.fn();
    render(<Harness onSnapChange={onSnapChange} />);
    const capture = installPointerCapture(handle());

    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 500 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 250 });
    expect(pendingFrames).toHaveLength(1);
    expect(screen.getByLabelText("height")).toHaveTextContent("300");

    fireEvent.pointerUp(handle(), { pointerId: 1, clientY: 800 });

    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(pendingFrames).toHaveLength(0);
    expect(onSnapChange).toHaveBeenLastCalledWith("expanded");
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(screen.getByLabelText("dragging")).toHaveTextContent("no");
  });

  it("ignores buttons and prevents another pointer from stealing the drag", () => {
    render(<Harness />);
    const capture = installPointerCapture(handle());

    fireEvent.pointerDown(screen.getByRole("button", { name: "nested action" }), {
      pointerId: 9,
      clientY: 500,
    });
    expect(screen.getByLabelText("dragging")).toHaveTextContent("no");
    expect(capture.setPointerCapture).not.toHaveBeenCalled();

    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 500 });
    fireEvent.pointerDown(handle(), { pointerId: 2, clientY: 200 });
    fireEvent.pointerMove(handle(), { pointerId: 2, clientY: 0 });
    expect(capture.setPointerCapture).toHaveBeenCalledTimes(1);
    expect(capture.setPointerCapture).toHaveBeenCalledWith(1);
    expect(pendingFrames).toHaveLength(0);

    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 400 });
    flushAnimationFrames();
    expect(screen.getByLabelText("height")).toHaveTextContent("400");
  });

  it("starts at rendered height and normalizes snaps to computed max-height", () => {
    const onSnapChange = vi.fn();
    render(
      <Harness
        renderedHeight={360}
        presentationMaxHeight="400px"
        onSnapChange={onSnapChange}
      />,
    );

    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 500 });
    expect(screen.getByLabelText("height")).toHaveTextContent("360");
    expect(screen.getByLabelText("ceiling")).toHaveTextContent("400");

    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 0 });
    flushAnimationFrames();
    expect(screen.getByLabelText("height")).toHaveTextContent("400");
    expect(sheetElement()).toHaveStyle({ height: "400px", maxHeight: "400px" });

    fireEvent.pointerUp(handle(), { pointerId: 1, clientY: 0 });
    expect(onSnapChange).toHaveBeenLastCalledWith("expanded");
  });

  it("falls back to expanded height when computed max-height is not finite", () => {
    render(<Harness presentationMaxHeight="none" />);

    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 500 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: -500 });
    flushAnimationFrames();

    expect(screen.getByLabelText("ceiling")).toHaveTextContent("600");
    expect(screen.getByLabelText("height")).toHaveTextContent("600");
  });

  it("keeps the pointer-down geometry snapshot across rerenders", () => {
    const onSnapChange = vi.fn();
    const view = render(
      <Harness geometry={geometry} onSnapChange={onSnapChange} />,
    );

    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 500 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 350 });
    view.rerender(
      <Harness
        geometry={{ collapsed: 100, half: 200, expanded: 400, ceiling: 400 }}
        onSnapChange={onSnapChange}
      />,
    );
    flushAnimationFrames();
    fireEvent.pointerUp(handle(), { pointerId: 1, clientY: 350 });

    expect(onSnapChange).toHaveBeenLastCalledWith("half");
  });

  it("settles pointer cancellation and lost capture from the latest position", () => {
    const cancelSnapChange = vi.fn();
    const cancelled = render(<Harness onSnapChange={cancelSnapChange} />);
    const cancelCapture = installPointerCapture(handle());
    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 500 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 350 });
    fireEvent.pointerCancel(handle(), { pointerId: 1 });
    expect(cancelSnapChange).toHaveBeenLastCalledWith("half");
    expect(cancelCapture.releasePointerCapture).toHaveBeenCalledWith(1);
    cancelled.unmount();

    const lostSnapChange = vi.fn();
    render(<Harness onSnapChange={lostSnapChange} />);
    const lostCapture = installPointerCapture(handle());
    fireEvent.pointerDown(handle(), { pointerId: 2, clientY: 500 });
    fireEvent.pointerMove(handle(), { pointerId: 2, clientY: 100 });
    fireEvent.lostPointerCapture(handle(), { pointerId: 2 });
    expect(lostSnapChange).toHaveBeenLastCalledWith("expanded");
    expect(lostCapture.releasePointerCapture).not.toHaveBeenCalled();
  });

  it("steps and clamps keyboard commands, preventing default only on change", () => {
    const onSnapChange = vi.fn();
    render(<Harness initialSnap="collapsed" onSnapChange={onSnapChange} />);

    expect(fireEvent.keyDown(handle(), { key: "ArrowDown" })).toBe(true);
    expect(onSnapChange).not.toHaveBeenCalled();

    expect(fireEvent.keyDown(handle(), { key: "ArrowUp" })).toBe(false);
    expect(onSnapChange).toHaveBeenLastCalledWith("half");
    expect(fireEvent.keyDown(handle(), { key: "ArrowUp" })).toBe(false);
    expect(onSnapChange).toHaveBeenLastCalledWith("expanded");
    expect(fireEvent.keyDown(handle(), { key: "ArrowUp" })).toBe(true);
    expect(onSnapChange).toHaveBeenCalledTimes(2);

    expect(fireEvent.keyDown(handle(), { key: "Home" })).toBe(false);
    expect(onSnapChange).toHaveBeenLastCalledWith("collapsed");
    expect(fireEvent.keyDown(handle(), { key: "Home" })).toBe(true);
    expect(fireEvent.keyDown(handle(), { key: "End" })).toBe(false);
    expect(onSnapChange).toHaveBeenLastCalledWith("expanded");
  });

  it("lets a consumer prevent package pointer and keyboard behavior", () => {
    const userPointerDown = vi.fn((event: React.PointerEvent<HTMLElement>) => {
      event.preventDefault();
    });
    const userKeyDown = vi.fn((event: React.KeyboardEvent<HTMLElement>) => {
      event.preventDefault();
    });
    render(
      <Harness
        initialSnap="half"
        handleUserProps={{
          onPointerDown: userPointerDown,
          onKeyDown: userKeyDown,
        }}
      />,
    );

    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 500 });
    expect(userPointerDown).toHaveBeenCalled();
    expect(screen.getByLabelText("dragging")).toHaveTextContent("no");

    fireEvent.keyDown(handle(), { key: "ArrowUp" });
    expect(userKeyDown).toHaveBeenCalled();
    expect(sheetElement()).toHaveAttribute("data-snap", "half");
  });

  it("suppresses transitions only while dragging or under reduced motion", () => {
    const normal = render(<Harness />);
    expect(sheetElement().style.transitionDuration).toBe("");

    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 500 });
    expect(sheetElement().style.transitionDuration).toBe("0ms");
    fireEvent.pointerCancel(handle(), { pointerId: 1 });
    expect(sheetElement().style.transitionDuration).toBe("");
    normal.unmount();

    render(<Harness reducedMotion />);
    expect(sheetElement().style.transitionDuration).toBe("0ms");
  });

  it("exposes controlled setSnap and step operations", () => {
    render(<Harness initialSnap="half" />);

    fireEvent.click(screen.getByRole("button", { name: "step up" }));
    expect(sheetElement()).toHaveAttribute("data-snap", "expanded");
    fireEvent.click(screen.getByRole("button", { name: "step up" }));
    expect(sheetElement()).toHaveAttribute("data-snap", "expanded");
    fireEvent.click(screen.getByRole("button", { name: "step down" }));
    expect(sheetElement()).toHaveAttribute("data-snap", "half");
    fireEvent.click(screen.getByRole("button", { name: "set collapsed" }));
    expect(sheetElement()).toHaveAttribute("data-snap", "collapsed");
  });

  it("cancels a queued frame and abandons its drag session on unmount", () => {
    const onSnapChange = vi.fn();
    const view = render(<Harness onSnapChange={onSnapChange} />);
    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 500 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 350 });
    expect(pendingFrames).toHaveLength(1);

    view.unmount();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(pendingFrames).toHaveLength(0);
    expect(onSnapChange).not.toHaveBeenCalled();
  });
});
