import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TripDay } from "@laugh-tale-island/core";
import { DayHeader } from "./DayHeader";

afterEach(cleanup);

const days: TripDay[] = [
  { id: "day-one", date: "2040-06-12", title: "Harbor", nodes: [] },
  { id: "day-two", date: "2040-06-13", title: "Museum", nodes: [] },
];

function HeaderHarness({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const [selectedDayId, setSelectedDayId] = useState("day-one");
  return (
    <DayHeader
      tripTitle="Synthetic journey"
      timezoneLabel="Asia/Tokyo"
      clockLabel="18:30"
      days={days}
      selectedDayId={selectedDayId}
      expanded={expanded}
      reducedMotion={reducedMotion}
      onExpandedChange={setExpanded}
      onDaySelect={setSelectedDayId}
      onReturnToNow={vi.fn()}
      onReturnToLodging={vi.fn()}
    />
  );
}

describe("DayHeader", () => {
  it("keeps clock and Lucide controls centered and accessible in both states", async () => {
    const user = userEvent.setup();
    render(<HeaderHarness />);

    const header = screen.getByRole("banner", { name: "Trip controls" });
    const clock = screen.getByLabelText("Asia/Tokyo time");
    const lodging = screen.getByRole("button", { name: "Return to lodging" });
    const current = screen.getByRole("button", {
      name: "Return to the current itinerary item",
    });
    const collapse = screen.getByRole("button", { name: "Collapse date choices" });

    expect(header).toHaveAttribute("data-controls-alignment", "centered");
    expect(clock).toHaveTextContent("18:30");
    for (const control of [lodging, current, collapse]) {
      expect(control).toHaveAttribute("data-touch-target", "44");
      expect(control.querySelector("svg")).not.toBeNull();
    }

    await user.click(collapse);
    expect(header).toHaveAttribute("data-expanded", "false");
    expect(screen.getByTestId("date-rail")).toHaveAttribute("inert");
    expect(screen.getByTestId("date-rail")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: "Expand date choices" }).querySelector("svg"))
      .not.toBeNull();
    expect(lodging).toBeVisible();
    expect(current).toBeVisible();
  });

  it("supports immediate motion reversal and keeps date targets operable only when shown", async () => {
    const user = userEvent.setup();
    render(<HeaderHarness />);

    await user.click(screen.getByRole("button", { name: "Collapse date choices" }));
    await user.click(screen.getByRole("button", { name: "Expand date choices" }));

    const rail = screen.getByTestId("date-rail");
    expect(rail).not.toHaveAttribute("inert");
    expect(rail).toHaveAttribute("aria-hidden", "false");
    const dayTwo = screen.getByRole("button", { name: /Museum/ });
    expect(dayTwo).toHaveAttribute("data-touch-target", "44");
    await user.click(dayTwo);
    expect(dayTwo).toHaveAttribute("aria-pressed", "true");
  });

  it("exposes synchronous final-state motion semantics when motion is reduced", async () => {
    const user = userEvent.setup();
    render(<HeaderHarness reducedMotion />);

    const header = screen.getByRole("banner", { name: "Trip controls" });
    expect(header).toHaveAttribute("data-motion-duration", "0ms");
    await user.click(screen.getByRole("button", { name: "Collapse date choices" }));
    expect(header).toHaveAttribute("data-expanded", "false");
    expect(header).toHaveAttribute("data-motion-duration", "0ms");
  });
});
