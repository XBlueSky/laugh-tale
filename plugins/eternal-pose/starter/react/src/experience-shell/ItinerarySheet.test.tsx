import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ItinerarySheet } from "./ItinerarySheet";
import type { SheetGeometry } from "./sheet-geometry";

const baseCss = readFileSync(
  resolve(process.cwd(), "src/ui/styles/base.css"),
  "utf8",
);

const geometry: SheetGeometry = {
  collapsed: 128,
  half: 220,
  expanded: 300,
  ceiling: 300,
};

afterEach(cleanup);

describe("ItinerarySheet", () => {
  it("takes over from an in-flight layout transition at the rendered height", () => {
    const onSnapChange = vi.fn();
    const { rerender } = render(
      <ItinerarySheet
        snap="expanded"
        geometry={geometry}
        dayTitle="Harbor day"
        itineraryCount={4}
        onSnapChange={onSnapChange}
        onReturnToNow={vi.fn()}
      >
        <p>Timeline</p>
      </ItinerarySheet>,
    );
    const sheet = screen.getByRole("region", { name: "Itinerary" });
    const handle = screen.getByRole("button", { name: "Drag itinerary sheet" });
    vi.spyOn(sheet, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 320,
      bottom: 214,
      left: 0,
      width: 320,
      height: 214,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(handle, { pointerId: 7, clientY: 380, timeStamp: 10 });
    rerender(
      <ItinerarySheet
        snap="expanded"
        geometry={{ collapsed: 128, half: 160, expanded: 180, ceiling: 180 }}
        dayTitle="Harbor day"
        itineraryCount={4}
        onSnapChange={onSnapChange}
        onReturnToNow={vi.fn()}
      >
        <p>Timeline</p>
      </ItinerarySheet>,
    );
    fireEvent.pointerMove(handle, { pointerId: 7, clientY: 340, timeStamp: 30 });

    expect(sheet).toHaveAttribute("data-dragging", "true");
    expect(sheet).toHaveStyle({ height: "254px" });
    expect(sheet).toHaveStyle({ maxHeight: "300px" });
    expect(sheet).toHaveStyle({ transitionDuration: "0ms" });

    fireEvent.pointerUp(handle, { pointerId: 7, clientY: 340, timeStamp: 50 });
    expect(onSnapChange).toHaveBeenCalledWith("half");
  });

  it("keeps collapsed content to one compact toolbar with icon navigation", async () => {
    const user = userEvent.setup();
    const onReturnToNow = vi.fn();
    render(
      <ItinerarySheet
        snap="collapsed"
        geometry={geometry}
        dayTitle="A deliberately long title that must not widen the mobile viewport"
        itineraryCount={12}
        onSnapChange={vi.fn()}
        onReturnToNow={onReturnToNow}
      >
        <p>Large selected-day summary must stay out of collapsed view.</p>
      </ItinerarySheet>,
    );

    const toolbar = screen.getByRole("toolbar", { name: "Itinerary controls" });
    const title = screen.getByText(/deliberately long title/);
    const count = screen.getByText("12 stops");
    const currentButton = screen.getByRole("button", {
      name: "Return to the current itinerary item",
    });

    expect(toolbar).toHaveAttribute("data-compact", "true");
    expect(baseCss).toMatch(
      /\.itinerary-sheet__toolbar\s*\{[^}]*height:\s*52px;[^}]*max-height:\s*52px;/s,
    );
    expect(baseCss).toMatch(
      /\.itinerary-sheet__drag-handle\s*\{[^}]*height:\s*44px;/s,
    );
    expect(title).toHaveAttribute("data-ellipsis", "true");
    expect(count).toHaveAttribute("data-secondary", "true");
    expect(currentButton).toHaveAttribute("data-icon-control", "true");
    expect(baseCss).toMatch(
      /\[data-touch-target="44"\]\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s,
    );
    expect(currentButton.querySelector("svg")).not.toBeNull();
    expect(screen.queryByText(/Large selected-day summary/)).not.toBeInTheDocument();

    await user.click(currentButton);
    expect(onReturnToNow).toHaveBeenCalledTimes(1);
  });

  it("offers keyboard equivalents for every stable drag snap", () => {
    const onSnapChange = vi.fn();
    const { rerender } = render(
      <ItinerarySheet
        snap="half"
        geometry={geometry}
        dayTitle="Harbor day"
        itineraryCount={4}
        onSnapChange={onSnapChange}
        onReturnToNow={vi.fn()}
      >
        <p>Timeline</p>
      </ItinerarySheet>,
    );
    const handle = screen.getByRole("button", { name: "Drag itinerary sheet" });

    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(onSnapChange).toHaveBeenLastCalledWith("collapsed");
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(onSnapChange).toHaveBeenLastCalledWith("expanded");

    rerender(
      <ItinerarySheet
        snap="collapsed"
        geometry={geometry}
        dayTitle="Harbor day"
        itineraryCount={4}
        onSnapChange={onSnapChange}
        onReturnToNow={vi.fn()}
      >
        <p>Timeline</p>
      </ItinerarySheet>,
    );
    fireEvent.keyDown(handle, { key: "End" });
    expect(onSnapChange).toHaveBeenLastCalledWith("expanded");
  });

  it("keeps route loading, label, and retry in one centered status row", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ItinerarySheet
        snap="half"
        geometry={geometry}
        dayTitle="Harbor day"
        itineraryCount={4}
        onSnapChange={vi.fn()}
        onReturnToNow={vi.fn()}
        routeStatus={{
          state: "error",
          label: "Route unavailable",
          onRetry,
        }}
      >
        <p>Timeline</p>
      </ItinerarySheet>,
    );

    const status = screen.getByRole("status");
    const label = screen.getByText("Route unavailable");
    const retry = screen.getByRole("button", { name: "Retry route" });
    const icon = status.querySelector("svg");
    expect(status).toHaveAttribute("data-layout", "centered-baseline");
    expect(label.parentElement).toBe(status);
    expect(retry.parentElement).toBe(status);
    expect(icon?.parentElement).toBe(status);
    expect(baseCss).toMatch(
      /\.itinerary-sheet\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s,
    );
    expect(baseCss).toMatch(
      /\.itinerary-sheet__scroll\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1;/s,
    );

    await user.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
