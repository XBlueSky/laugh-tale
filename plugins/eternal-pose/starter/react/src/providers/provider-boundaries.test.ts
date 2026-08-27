import { describe, expect, it, vi } from "vitest";
import { nodeMapOwnerId, type MapPresentation } from "@laugh-tale/core";

import { FakeMapAdapter } from "./fake/FakeMapAdapter";
import { createGoogleMapsUrl } from "./google/google-maps-url";

describe("provider-neutral boundaries", () => {
  it("builds an exact keyless Google Maps consumer URL", () => {
    expect(
      createGoogleMapsUrl({
        origin: "Hotel A",
        destination: "Museum B",
        travelMode: "transit",
      }),
    ).toBe(
      "https://www.google.com/maps/dir/?api=1&origin=Hotel%20A&destination=Museum%20B&travelmode=transit",
    );
  });

  it("records fake-map calls and emits only while mounted", async () => {
    const fake = new FakeMapAdapter();
    const onPlaceSelect = vi.fn();
    const onRouteSelect = vi.fn();
    const element = document.createElement("div");
    const presentation: MapPresentation = {
      places: [
        {
          ownerId: nodeMapOwnerId("museum"),
          label: "Museum",
          coordinates: { lat: 25.01, lng: 121.51 },
          tone: "default",
        },
        {
          ownerId: nodeMapOwnerId("garden"),
          label: "Garden",
          coordinates: { lat: 25.02, lng: 121.5 },
          tone: "default",
        },
      ],
      routes: [],
    };

    await fake.mount(element, { onPlaceSelect, onRouteSelect });
    fake.render(presentation);
    fake.focus({ kind: "place", id: nodeMapOwnerId("museum") });
    fake.fit([nodeMapOwnerId("museum"), nodeMapOwnerId("garden")]);
    fake.setPadding({ top: 10, right: 20, bottom: 30, left: 40 });
    fake.setUserLocation({ lat: 25, lng: 121 });
    fake.emitPlaceSelect(nodeMapOwnerId("museum"));
    fake.emitRouteSelect("walk-to-garden");

    expect(fake.mountCalls).toEqual([element]);
    expect(fake.renderCalls).toEqual([presentation]);
    expect(fake.focusCalls).toEqual([
      { kind: "place", id: nodeMapOwnerId("museum") },
    ]);
    expect(fake.fitCalls).toEqual([
      [nodeMapOwnerId("museum"), nodeMapOwnerId("garden")],
    ]);
    expect(fake.paddingCalls).toEqual([{ top: 10, right: 20, bottom: 30, left: 40 }]);
    expect(fake.userLocationCalls).toEqual([{ lat: 25, lng: 121 }]);
    expect(onPlaceSelect).toHaveBeenCalledWith(nodeMapOwnerId("museum"));
    expect(onRouteSelect).toHaveBeenCalledWith("walk-to-garden");

    fake.destroy();
    fake.emitPlaceSelect("garden");
    expect(onPlaceSelect).toHaveBeenCalledTimes(1);
    expect(fake.destroyCalls).toBe(1);
  });
});
