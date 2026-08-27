import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SheetGeometry, SheetSnap } from "@laugh-tale-island/core";
import { useItinerarySheet, type UseItinerarySheetOptions } from "@laugh-tale-island/react";

afterEach(cleanup);

const geometry: SheetGeometry = {
  collapsed: 100,
  half: 300,
  expanded: 600,
  ceiling: 600,
};

interface HarnessProps {
  initialSnap?: SheetSnap;
  reducedMotion?: boolean;
  onSnapChange?: (snap: SheetSnap) => void;
  handleUserProps?: Parameters<
    ReturnType<typeof useItinerarySheet>["getHandleProps"]
  >[0];
}

function Harness({
  initialSnap = "half",
  reducedMotion,
  onSnapChange,
  handleUserProps,
}: HarnessProps) {
  const [snap, setSnap] = useState<SheetSnap>(initialSnap);
  const options: UseItinerarySheetOptions = {
    snap,
    geometry,
    onSnapChange: (next) => {
      setSnap(next);
      onSnapChange?.(next);
    },
    ...(reducedMotion === undefined ? {} : { reducedMotion }),
  };
  const sheet = useItinerarySheet(options);
  const sheetProps = sheet.getSheetProps();

  return (
    <section aria-label="sheet" {...sheetProps}>
      <button
        type="button"
        aria-label="handle"
        {...sheet.getHandleProps(handleUserProps)}
      />
      <output aria-label="dragging">{sheet.dragging ? "yes" : "no"}</output>
      <output aria-label="height">{sheet.height}</output>
      <button type="button" aria-label="step up" onClick={() => sheet.step(1)} />
      <button type="button" aria-label="step down" onClick={() => sheet.step(-1)} />
    </section>
  );
}

function sheetElement(): HTMLElement {
  return screen.getByRole("region", { name: "sheet" });
}

function handle(): HTMLElement {
  return screen.getByRole("button", { name: "handle" });
}

describe("useItinerarySheet", () => {
  it("drags with pointer capture and snaps to the nearest point on release", () => {
    const onSnapChange = vi.fn();
    render(<Harness onSnapChange={onSnapChange} />);

    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 500 });
    expect(screen.getByLabelText("dragging")).toHaveTextContent("yes");

    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 240 });
    // startHeight 300 (half) + (500 - 240) = 560
    expect(screen.getByLabelText("height")).toHaveTextContent("560");

    fireEvent.pointerUp(handle(), { pointerId: 1, clientY: 240 });
    expect(onSnapChange).toHaveBeenCalledWith("expanded");
    expect(screen.getByLabelText("dragging")).toHaveTextContent("no");
    expect(sheetElement()).toHaveAttribute("data-snap", "expanded");
  });

  it("ignores pointer events from a different pointer id and cancels cleanly", () => {
    const onSnapChange = vi.fn();
    render(<Harness onSnapChange={onSnapChange} />);

    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 500 });
    fireEvent.pointerMove(handle(), { pointerId: 2, clientY: 100 });
    expect(screen.getByLabelText("height")).toHaveTextContent("300");

    fireEvent.pointerCancel(handle(), { pointerId: 1 });
    expect(screen.getByLabelText("dragging")).toHaveTextContent("no");
    expect(onSnapChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText("height")).toHaveTextContent("300");
  });

  it("steps through snaps with the keyboard and clamps at the ends", () => {
    render(<Harness initialSnap="collapsed" />);

    fireEvent.keyDown(handle(), { key: "ArrowDown" });
    expect(sheetElement()).toHaveAttribute("data-snap", "collapsed");

    fireEvent.keyDown(handle(), { key: "ArrowUp" });
    expect(sheetElement()).toHaveAttribute("data-snap", "half");

    fireEvent.keyDown(handle(), { key: "End" });
    expect(sheetElement()).toHaveAttribute("data-snap", "expanded");

    fireEvent.keyDown(handle(), { key: "Home" });
    expect(sheetElement()).toHaveAttribute("data-snap", "collapsed");
  });

  it("lets a consumer handler cancel the package behavior for one event", () => {
    const userKeyDown = vi.fn((event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
      }
    });
    render(<Harness initialSnap="half" handleUserProps={{ onKeyDown: userKeyDown }} />);

    fireEvent.keyDown(handle(), { key: "ArrowUp" });
    expect(userKeyDown).toHaveBeenCalled();
    expect(sheetElement()).toHaveAttribute("data-snap", "half");

    fireEvent.keyDown(handle(), { key: "Home" });
    expect(sheetElement()).toHaveAttribute("data-snap", "collapsed");
  });

  it("exposes controlled setSnap/step and reduced-motion transition suppression", () => {
    render(<Harness initialSnap="half" reducedMotion />);

    expect(sheetElement().style.transitionDuration).toBe("0ms");

    fireEvent.click(screen.getByRole("button", { name: "step up" }));
    expect(sheetElement()).toHaveAttribute("data-snap", "expanded");
    fireEvent.click(screen.getByRole("button", { name: "step up" }));
    expect(sheetElement()).toHaveAttribute("data-snap", "expanded");
    fireEvent.click(screen.getByRole("button", { name: "step down" }));
    expect(sheetElement()).toHaveAttribute("data-snap", "half");
    expect(screen.getByLabelText("height")).toHaveTextContent("300");
  });
});
