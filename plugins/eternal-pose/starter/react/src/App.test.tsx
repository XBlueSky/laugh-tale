import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FakeMapAdapter } from "./providers/fake/FakeMapAdapter";
import { completeTrip } from "./trip-content/fixtures/complete-trip";
import { App } from "./App";

afterEach(cleanup);

describe("App setup truth", () => {
  it("does not construct a provider while trip content is missing", () => {
    const adapterFactory = vi.fn(() => new FakeMapAdapter());

    render(<App tripOverride={null} adapterFactory={adapterFactory} />);

    expect(screen.getByRole("heading", { name: "Trip content required" })).toBeVisible();
    expect(screen.getByText(/add real trip content/i)).toBeVisible();
    expect(adapterFactory).not.toHaveBeenCalled();
  });

  it("distinguishes a missing provider key from a provider load failure", () => {
    const { rerender } = render(<App tripOverride={completeTrip} />);

    expect(screen.getByRole("heading", { name: "Map configuration required" })).toBeVisible();
    expect(screen.getByText(/VITE_GOOGLE_MAPS_API_KEY/)).toBeVisible();

    rerender(
      <App
        tripOverride={completeTrip}
        setupIssue={{ kind: "provider-load", reason: "Synthetic loader failure" }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Map unavailable" })).toBeVisible();
    expect(screen.getByText("Synthetic loader failure")).toBeVisible();
    expect(screen.queryByText(/connected/i)).not.toBeInTheDocument();
  });
});
