import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildRoutePresentations,
  validateTrip,
  type EffectiveNode,
  type RouteEdge,
  type Trip,
  type TripDay,
} from "@laugh-tale-island/core";

interface MutableTestTrip {
  locale?: string;
  timezone?: string;
  days: Array<{
    nodes: Array<{
      place: { identity: Record<string, unknown> };
      payload: { presentationRole?: string };
    }>;
  }>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

function v2Trip(): Trip {
  return {
    id: "v2-trip",
    title: "V2 trip",
    locale: "zh-Hant-TW",
    timezone: "Asia/Tokyo",
    startDate: "2040-06-12",
    endDate: "2040-06-12",
    days: [
      {
        id: "day-one",
        date: "2040-06-12",
        title: "Day one",
        nodes: [
          {
            id: "coordinate-place",
            dayId: "day-one",
            kind: "sightseeing",
            title: "Coordinate place",
            timing: { certainty: "suggested" },
            optionality: "core",
            place: {
              name: "Coordinate place",
              certainty: "confirmed",
              identity: {
                status: "resolved",
                coordinates: { lat: 35.6762, lng: 139.6503 },
              },
            },
            payload: {},
          },
          {
            id: "provider-place",
            dayId: "day-one",
            kind: "sightseeing",
            title: "Provider place",
            timing: { certainty: "suggested" },
            optionality: "core",
            place: {
              name: "Provider place",
              certainty: "suggested",
              identity: {
                status: "resolved",
                providerReference: { provider: "google", id: "places/example" },
              },
            },
            payload: {},
          },
          {
            id: "unresolved-place",
            dayId: "day-one",
            kind: "sightseeing",
            title: "Unresolved place",
            timing: { certainty: "unknown" },
            optionality: "core",
            place: {
              name: "Unresolved place",
              certainty: "unverified",
              identity: { status: "unresolved", reason: "not-reviewed" },
            },
            payload: {},
          },
          {
            id: "custom-place",
            dayId: "day-one",
            kind: "custom",
            title: "Custom place",
            timing: { certainty: "unknown" },
            optionality: "optional",
            payload: {
              customKind: "note",
              presentationRole: "task",
              capabilities: { completion: true },
              data: {},
            },
          },
        ],
      },
    ],
    routes: [],
    candidateGroups: [],
    reservations: [],
    tasks: [],
  };
}

function dayForRoutes(routes: RouteEdge[]): TripDay & { routes: RouteEdge[] } {
  return {
    id: "day-one",
    date: "2040-06-12",
    title: "Day one",
    nodes: ["a", "b", "c", "d"].map((id) => ({
      id,
      dayId: "day-one",
      kind: "sightseeing",
      title: id.toUpperCase(),
      timing: { certainty: "unknown" },
      optionality: "core",
      place: {
        name: id.toUpperCase(),
        certainty: "suggested",
        identity: { status: "resolved", coordinates: { lat: 35, lng: 139 } },
      },
      payload: {},
    })),
    routes,
  };
}

function effectiveNodes(day: TripDay, ids: string[]): EffectiveNode[] {
  return ids.map((id) => ({
    node: day.nodes.find((node) => node.id === id)!,
    sourceNodeId: id,
    completed: false,
    skipped: false,
  }));
}

function route(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  mode: "walking" | "unknown",
): RouteEdge {
  return {
    id,
    dayId: "day-one",
    fromNodeId,
    toNodeId,
    mode,
    source: "manual",
    certainty: "suggested",
  };
}

describe("v2 authored trip facts", () => {
  it("validates canonical authored locale, timezone, and each place identity state", () => {
    expect(validateTrip(v2Trip())).toEqual({ errors: [], warnings: [] });
  });

  it("validates timezone formatting at the fixed instant instead of the host clock", () => {
    let formattedAt: Date | number | undefined;
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function () {
      return {
        format(value?: Date | number) {
          if (value === undefined) {
            throw new RangeError("Timezone validation must provide a fixed instant.");
          }
          formattedAt = value;
          return "valid";
        },
      } as Intl.DateTimeFormat;
    });

    expect(validateTrip(v2Trip()).errors).toEqual([]);
    expect(formattedAt).toBeInstanceOf(Date);
    expect((formattedAt as Date).toISOString()).toBe("2000-01-01T00:00:00.000Z");
  });

  it("keeps unknown routes full and only navigable through explicitly authored navigation", () => {
    const withoutNavigation = route("unknown-no-navigation", "a", "b", "unknown");
    const withExternalNavigation = {
      ...route("unknown-external-navigation", "b", "c", "unknown"),
      navigation: { origin: "External A", destination: "External B" },
    };
    const day = dayForRoutes([withoutNavigation, withExternalNavigation]);

    expect(buildRoutePresentations(day, effectiveNodes(day, ["a", "b", "c"]))).toEqual([
      expect.objectContaining({
        edge: withoutNavigation,
        display: "full",
        navigable: false,
      }),
      expect.objectContaining({
        edge: withExternalNavigation,
        display: "full",
        navigable: true,
      }),
    ]);
  });

  it("recomposes a path containing unknown mode as unknown", () => {
    const day = dayForRoutes([
      route("walk-in", "a", "b", "walking"),
      route("unknown-middle", "b", "c", "unknown"),
      route("walk-out", "c", "d", "walking"),
    ]);

    expect(buildRoutePresentations(day, effectiveNodes(day, ["a", "d"]))[0]?.edge).toMatchObject({
      mode: "unknown",
      source: "recomposed",
    });
  });

  it("accepts provider references through provider and id", () => {
    const trip = v2Trip();
    expect(validateTrip(trip).errors).not.toContainEqual(
      expect.objectContaining({ code: "INVALID_PROVIDER_REFERENCE" }),
    );
  });

  const invalidCases: Array<{
    name: string;
    mutate: (trip: MutableTestTrip) => void;
    code: string;
  }> = [
    { name: "missing locale", mutate: (trip) => delete trip.locale, code: "INVALID_LOCALE" },
    { name: "noncanonical locale", mutate: (trip) => { trip.locale = "EN-us"; }, code: "NONCANONICAL_LOCALE" },
    { name: "invalid locale", mutate: (trip) => { trip.locale = "not a locale"; }, code: "INVALID_LOCALE" },
    { name: "missing timezone", mutate: (trip) => delete trip.timezone, code: "INVALID_TIMEZONE" },
    { name: "numeric-offset timezone", mutate: (trip) => { trip.timezone = "+09:00"; }, code: "INVALID_TIMEZONE" },
    { name: "malformed named timezone", mutate: (trip) => { trip.timezone = "Asia/Not_A_Zone"; }, code: "INVALID_TIMEZONE" },
    { name: "blank provider", mutate: (trip) => { trip.days[0].nodes[1].place.identity = { status: "resolved", providerReference: { provider: " ", id: "places/example" } }; }, code: "INVALID_PROVIDER_REFERENCE" },
    { name: "blank provider id", mutate: (trip) => { trip.days[0].nodes[1].place.identity = { status: "resolved", providerReference: { provider: "google", id: " " } }; }, code: "INVALID_PROVIDER_REFERENCE" },
    { name: "empty resolved identity", mutate: (trip) => { trip.days[0].nodes[0].place.identity = { status: "resolved" }; }, code: "INVALID_PLACE_IDENTITY" },
    { name: "fabricated unresolved coordinates", mutate: (trip) => { trip.days[0].nodes[2].place.identity = { status: "unresolved", reason: "ambiguous", coordinates: { lat: 35, lng: 139 } }; }, code: "INVALID_PLACE_IDENTITY" },
  ];

  it.each(invalidCases)("rejects $name with its v2 validation code", ({ mutate, code }) => {
    const trip = v2Trip() as unknown as MutableTestTrip;
    mutate(trip);

    expect(validateTrip(trip as unknown as Trip).errors).toContainEqual(expect.objectContaining({ code }));
  });

  it.each([null, "35,139", 35, true, []].map((coordinates) => [coordinates]))("rejects malformed present coordinates despite a valid reference: %j", (coordinates) => {
    const trip = v2Trip() as unknown as MutableTestTrip;
    trip.days[0].nodes[1].place.identity.coordinates = coordinates;
    expect(validateTrip(trip as unknown as Trip).errors).toContainEqual(
      expect.objectContaining({ code: "INVALID_COORDINATE" }),
    );
  });

  it.each(["primary", "journey", "task"])("accepts custom presentationRole %s", (presentationRole) => {
    const trip = v2Trip() as unknown as MutableTestTrip;
    trip.days[0].nodes[3].payload.presentationRole = presentationRole;
    expect(validateTrip(trip as unknown as Trip).errors).not.toContainEqual(
      expect.objectContaining({ code: "INVALID_PRESENTATION_ROLE" }),
    );
  });

  it.each([undefined, "base", "connector"])("rejects custom presentationRole %s", (presentationRole) => {
    const trip = v2Trip() as unknown as MutableTestTrip;
    if (presentationRole === undefined) {
      delete trip.days[0].nodes[3].payload.presentationRole;
    } else {
      trip.days[0].nodes[3].payload.presentationRole = presentationRole;
    }

    expect(validateTrip(trip as unknown as Trip).errors).toContainEqual(
      expect.objectContaining({ code: "INVALID_PRESENTATION_ROLE" }),
    );
  });
});
