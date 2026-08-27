import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExperienceBindings } from "../../controllers/presentation-contract";
import { ItinerarySheetView } from "./ItinerarySheetView";

afterEach(cleanup);

function sheetBinding(snap: "collapsed" | "half" | "expanded"):
  ExperienceBindings["sheet"] {
  return {
    getSheetProps: () => ({
      style: { height: snap === "collapsed" ? "128px" : "300px" },
      "data-snap": snap,
    }),
    getHandleProps: () => ({
      onPointerDown: () => undefined,
      "aria-keyshortcuts": "ArrowUp ArrowDown Home End",
    }),
  };
}

const geometry = {
  collapsed: 128,
  half: 220,
  expanded: 300,
  ceiling: 300,
};

describe("ItinerarySheetView", () => {
  it("renders controller-owned geometry and semantic sheet bindings", () => {
    render(
      <ItinerarySheetView
        sheet={{ snap: "half", geometry }}
        binding={sheetBinding("half")}
        dayTitle="Harbor day"
        itineraryCount={4}
        onSnapChange={vi.fn()}
        onReturnToNow={vi.fn()}
      >
        <p>Timeline</p>
      </ItinerarySheetView>,
    );

    const sheet = screen.getByRole("region", { name: "Itinerary" });
    expect(sheet).toHaveAttribute("data-snap", "half");
    expect(sheet).toHaveStyle({ height: "300px" });
    expect(screen.getByText("Harbor day")).toBeVisible();
    expect(screen.getByText("4 stops")).toBeVisible();
    expect(screen.getByText("Timeline")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Drag itinerary sheet" }),
    ).toHaveAttribute("aria-keyshortcuts", "ArrowUp ArrowDown Home End");
  });

  it("keeps collapsed content hidden and exposes semantic snap/current actions", () => {
    const onSnapChange = vi.fn();
    const onReturnToNow = vi.fn();
    const { rerender } = render(
      <ItinerarySheetView
        sheet={{ snap: "collapsed", geometry }}
        binding={sheetBinding("collapsed")}
        dayTitle="Harbor day"
        itineraryCount={1}
        onSnapChange={onSnapChange}
        onReturnToNow={onReturnToNow}
      >
        <p>Timeline</p>
      </ItinerarySheetView>,
    );
    expect(screen.queryByText("Timeline")).not.toBeInTheDocument();
    expect(screen.getByText("1 stop")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Expand itinerary" }));
    expect(onSnapChange).toHaveBeenCalledWith("expanded");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Return to the current itinerary item",
      }),
    );
    expect(onReturnToNow).toHaveBeenCalledTimes(1);

    rerender(
      <ItinerarySheetView
        sheet={{ snap: "expanded", geometry }}
        binding={sheetBinding("expanded")}
        dayTitle="Harbor day"
        itineraryCount={1}
        onSnapChange={onSnapChange}
        onReturnToNow={onReturnToNow}
      >
        <p>Timeline</p>
      </ItinerarySheetView>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Collapse itinerary" }));
    expect(onSnapChange).toHaveBeenLastCalledWith("half");
  });

  it("keeps route failure and retry visible outside the timeline", () => {
    const retry = vi.fn();
    render(
      <ItinerarySheetView
        sheet={{ snap: "half", geometry }}
        binding={sheetBinding("half")}
        dayTitle="Harbor day"
        itineraryCount={2}
        onSnapChange={vi.fn()}
        onReturnToNow={vi.fn()}
        routeStatus={{
          state: "error",
          label: "Route unavailable",
          onRetry: retry,
        }}
      >
        <p>Timeline</p>
      </ItinerarySheetView>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Route unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry route" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
