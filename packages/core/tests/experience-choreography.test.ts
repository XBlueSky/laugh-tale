import { describe, expect, it } from "vitest";

import {
  createExperienceChoreographyState,
  reduceExperienceChoreography,
  type ExperienceChoreographyEvent,
  type ExperienceChoreographyState,
  type TripNavigationState,
} from "../src/index.js";

function experience(
  dayId: string | null,
  ownerId: string | null = null,
): TripNavigationState {
  return { surface: "experience", dayId, ownerId };
}

describe("createExperienceChoreographyState", () => {
  it("initializes a valid day with its automatic owner and one deterministic fit", () => {
    const state = createExperienceChoreographyState({
      navigation: experience("day,[one]", "old-manual-owner"),
      automaticOwnerId: "owner,\"current\"",
    });

    expect(state).toEqual({
      navigation: experience("day,[one]", "owner,\"current\""),
      selectionSource: "automatic",
      sheetSnap: "half",
      headerExpanded: true,
      headerRevision: 0,
      headerTransition: null,
      cameraRequest: {
        kind: "fit-day",
        dayId: "day,[one]",
        intentId: '["camera",1,"fit-day","day,[one]","day,[one]"]',
      },
      cameraRevision: 1,
      focusReturnOwnerId: null,
    });
  });

  it("retains authored ID bytes while normalizing an empty automatic owner", () => {
    const state = createExperienceChoreographyState({
      navigation: experience("  day/one  ", "old-owner"),
      automaticOwnerId: "   ",
    });

    expect(state.navigation).toEqual(experience("  day/one  "));
    expect(state.cameraRequest).toEqual({
      kind: "fit-day",
      dayId: "  day/one  ",
      intentId:
        '["camera",1,"fit-day","  day/one  ","  day/one  "]',
    });
  });

  it.each([
    { surface: "home", dayId: "ignored-day", ownerId: "ignored-owner" },
    experience(null, "ignored-owner"),
    experience("", "ignored-owner"),
    experience("   ", "ignored-owner"),
  ] satisfies TripNavigationState[])(
    "normalizes invalid navigation %# to neutral Home without camera work",
    (navigation) => {
      const state = createExperienceChoreographyState({
        navigation,
        automaticOwnerId: "automatic-owner",
      });

      expect(state.navigation).toEqual({
        surface: "home",
        dayId: null,
        ownerId: null,
      });
      expect(state.cameraRequest).toBeNull();
      expect(state.cameraRevision).toBe(0);
    },
  );
});

describe("reduceExperienceChoreography day selection", () => {
  it("resets manual day state while preserving header state and requests a fresh fit", () => {
    const initial = createExperienceChoreographyState({
      navigation: experience("day-one", "old-owner"),
      automaticOwnerId: "owner-one",
    });
    const manualState: ExperienceChoreographyState = {
      ...initial,
      selectionSource: "map",
      sheetSnap: "expanded",
      headerExpanded: false,
      headerRevision: 7,
      headerTransition: { id: 7, phase: "collapsing" },
      focusReturnOwnerId: "route-one",
    };

    const selected = reduceExperienceChoreography(manualState, {
      type: "select-day",
      dayId: "day-two",
      automaticOwnerId: "owner-two",
    });

    expect(selected).toEqual({
      ...manualState,
      navigation: experience("day-two", "owner-two"),
      selectionSource: "automatic",
      sheetSnap: "half",
      cameraRevision: 2,
      cameraRequest: {
        kind: "fit-day",
        dayId: "day-two",
        intentId: '["camera",2,"fit-day","day-two","day-two"]',
      },
      focusReturnOwnerId: null,
    });
  });

  it("normalizes an empty automatic owner without trimming a valid day", () => {
    const initial = createExperienceChoreographyState({
      navigation: experience("day-one"),
      automaticOwnerId: null,
    });

    const selected = reduceExperienceChoreography(initial, {
      type: "select-day",
      dayId: "  day-two  ",
      automaticOwnerId: " ",
    });

    expect(selected.navigation).toEqual(experience("  day-two  "));
    expect(selected.cameraRequest).toEqual({
      kind: "fit-day",
      dayId: "  day-two  ",
      intentId:
        '["camera",2,"fit-day","  day-two  ","  day-two  "]',
    });
  });

  it.each(["", "   "])("ignores an empty day ID %j", (dayId) => {
    const initial = createExperienceChoreographyState({
      navigation: experience("day-one"),
      automaticOwnerId: null,
    });

    expect(
      reduceExperienceChoreography(initial, {
        type: "select-day",
        dayId,
        automaticOwnerId: "owner-two",
      }),
    ).toBe(initial);
  });
});

describe("reduceExperienceChoreography selection sources", () => {
  it.each([
    { source: "list", focusReturnOwnerId: null },
    { source: "map", focusReturnOwnerId: "node-one" },
  ] as const)(
    "focuses a $source-selected node and records the source-specific focus return",
    ({ source, focusReturnOwnerId }) => {
      const initial = createExperienceChoreographyState({
        navigation: experience("day-one"),
        automaticOwnerId: "automatic-owner",
      });

      const selected = reduceExperienceChoreography(initial, {
        type: "select-node",
        dayId: "day-one",
        nodeId: "node-one",
        source,
      });

      expect(selected.navigation).toEqual(experience("day-one", "node-one"));
      expect(selected.selectionSource).toBe(source);
      expect(selected.focusReturnOwnerId).toBe(focusReturnOwnerId);
      expect(selected.cameraRevision).toBe(2);
      expect(selected.cameraRequest).toEqual({
        kind: "focus-owner",
        dayId: "day-one",
        ownerId: "node-one",
        intentId:
          '["camera",2,"focus-owner","day-one","node-one"]',
      });
    },
  );

  it("fits a list-selected route and clears any pending focus return", () => {
    const initial = createExperienceChoreographyState({
      navigation: experience("day-one"),
      automaticOwnerId: "automatic-owner",
    });
    const withPendingFocus: ExperienceChoreographyState = {
      ...initial,
      focusReturnOwnerId: "old-node",
    };

    const selected = reduceExperienceChoreography(withPendingFocus, {
      type: "select-route",
      dayId: "day-one",
      routeId: "route-one",
      source: "list",
    });

    expect(selected.navigation).toEqual(experience("day-one", "route-one"));
    expect(selected.selectionSource).toBe("list");
    expect(selected.focusReturnOwnerId).toBeNull();
    expect(selected.cameraRequest).toEqual({
      kind: "focus-route",
      dayId: "day-one",
      routeId: "route-one",
      intentId:
        '["camera",2,"focus-route","day-one","route-one"]',
    });
  });

  it("records a map-selected route without replacing the current camera request", () => {
    const initial = createExperienceChoreographyState({
      navigation: experience("day-one"),
      automaticOwnerId: "automatic-owner",
    });

    const selected = reduceExperienceChoreography(initial, {
      type: "select-route",
      dayId: "day-one",
      routeId: "route-one",
      source: "map",
    });

    expect(selected.navigation).toEqual(experience("day-one", "route-one"));
    expect(selected.selectionSource).toBe("map");
    expect(selected.focusReturnOwnerId).toBe("route-one");
    expect(selected.cameraRevision).toBe(1);
    expect(selected.cameraRequest).toBe(initial.cameraRequest);
  });

  it("accepts an automatic owner tick only for the displayed automatic day", () => {
    const initial = createExperienceChoreographyState({
      navigation: experience("day-one"),
      automaticOwnerId: "owner-one",
    });
    const withFocusReturn: ExperienceChoreographyState = {
      ...initial,
      focusReturnOwnerId: "pending-owner",
    };

    const ticked = reduceExperienceChoreography(withFocusReturn, {
      type: "automatic-owner-changed",
      dayId: "day-one",
      ownerId: "owner-two",
    });

    expect(ticked.navigation).toEqual(experience("day-one", "owner-two"));
    expect(ticked.cameraRequest).toBe(initial.cameraRequest);
    expect(ticked.cameraRevision).toBe(1);
    expect(ticked.focusReturnOwnerId).toBe("pending-owner");

    const cleared = reduceExperienceChoreography(ticked, {
      type: "automatic-owner-changed",
      dayId: "day-one",
      ownerId: null,
    });
    expect(cleared.navigation).toEqual(experience("day-one"));
  });

  it.each(["list", "map", "control"] as const)(
    "ignores automatic ticks while the source is $source",
    (selectionSource) => {
      const initial: ExperienceChoreographyState = {
        ...createExperienceChoreographyState({
          navigation: experience("day-one"),
          automaticOwnerId: "owner-one",
        }),
        selectionSource,
      };

      expect(
        reduceExperienceChoreography(initial, {
          type: "automatic-owner-changed",
          dayId: "day-one",
          ownerId: "owner-two",
        }),
      ).toBe(initial);
    },
  );

  it("ignores an automatic tick for another day", () => {
    const initial = createExperienceChoreographyState({
      navigation: experience("day-one"),
      automaticOwnerId: "owner-one",
    });

    expect(
      reduceExperienceChoreography(initial, {
        type: "automatic-owner-changed",
        dayId: "day-two",
        ownerId: "owner-two",
      }),
    ).toBe(initial);
  });

  it("restores automatic ownership, sheet position, focus, and camera intent", () => {
    const initial: ExperienceChoreographyState = {
      ...createExperienceChoreographyState({
        navigation: experience("day-one"),
        automaticOwnerId: "old-owner",
      }),
      navigation: experience("day-one", "manual-owner"),
      selectionSource: "map",
      sheetSnap: "expanded",
      focusReturnOwnerId: "manual-owner",
    };

    const restored = reduceExperienceChoreography(initial, {
      type: "restore-automatic",
      dayId: "day-one",
      ownerId: "automatic-owner",
    });

    expect(restored.navigation).toEqual(
      experience("day-one", "automatic-owner"),
    );
    expect(restored.selectionSource).toBe("automatic");
    expect(restored.sheetSnap).toBe("half");
    expect(restored.focusReturnOwnerId).toBeNull();
    expect(restored.cameraRequest).toEqual({
      kind: "focus-owner",
      dayId: "day-one",
      ownerId: "automatic-owner",
      intentId:
        '["camera",2,"focus-owner","day-one","automatic-owner"]',
    });
  });

  it.each([
    { type: "return-to-current", selectionSource: "automatic" },
    { type: "return-to-lodging", selectionSource: "control" },
  ] as const)(
    "$type selects the caller-supplied owner and requests focus",
    ({ type, selectionSource }) => {
      const initial: ExperienceChoreographyState = {
        ...createExperienceChoreographyState({
          navigation: experience("day-one"),
          automaticOwnerId: "old-owner",
        }),
        navigation: experience("day-one", "manual-owner"),
        selectionSource: "list",
        sheetSnap: "collapsed",
        focusReturnOwnerId: "manual-owner",
      };

      const restored = reduceExperienceChoreography(initial, {
        type,
        dayId: "day-one",
        ownerId: "caller-owner",
      });

      expect(restored.navigation).toEqual(
        experience("day-one", "caller-owner"),
      );
      expect(restored.selectionSource).toBe(selectionSource);
      expect(restored.sheetSnap).toBe("half");
      expect(restored.focusReturnOwnerId).toBeNull();
      expect(restored.cameraRequest).toEqual({
        kind: "focus-owner",
        dayId: "day-one",
        ownerId: "caller-owner",
        intentId:
          '["camera",2,"focus-owner","day-one","caller-owner"]',
      });
    },
  );

  it.each([
    { type: "select-node", dayId: "day-one", nodeId: "", source: "list" },
    {
      type: "select-route",
      dayId: "day-one",
      routeId: "   ",
      source: "map",
    },
    { type: "restore-automatic", dayId: "day-one", ownerId: "" },
    { type: "select-node", dayId: "day-two", nodeId: "node", source: "map" },
    {
      type: "select-route",
      dayId: "day-two",
      routeId: "route",
      source: "list",
    },
    {
      type: "restore-automatic",
      dayId: "day-two",
      ownerId: "owner",
    },
  ] satisfies ExperienceChoreographyEvent[])(
    "ignores invalid or mismatched selection %#",
    (event) => {
      const initial = createExperienceChoreographyState({
        navigation: experience("day-one"),
        automaticOwnerId: "owner-one",
      });

      expect(reduceExperienceChoreography(initial, event)).toBe(initial);
    },
  );
});

describe("reduceExperienceChoreography camera controls and Home", () => {
  it("fits a candidate without changing the displayed selection or sheet", () => {
    const initial: ExperienceChoreographyState = {
      ...createExperienceChoreographyState({
        navigation: experience("day-one"),
        automaticOwnerId: "owner-one",
      }),
      selectionSource: "list",
      sheetSnap: "expanded",
    };

    const fitted = reduceExperienceChoreography(initial, {
      type: "fit-candidate",
      dayId: "day-one",
      groupId: "group,[one]",
    });

    expect(fitted.navigation).toBe(initial.navigation);
    expect(fitted.selectionSource).toBe("list");
    expect(fitted.sheetSnap).toBe("expanded");
    expect(fitted.cameraRequest).toEqual({
      kind: "fit-candidate",
      dayId: "day-one",
      groupId: "group,[one]",
      intentId:
        '["camera",2,"fit-candidate","day-one","group,[one]"]',
    });
  });

  it("restores a fresh full-day fit while retaining selection state", () => {
    const initial: ExperienceChoreographyState = {
      ...createExperienceChoreographyState({
        navigation: experience("day-one"),
        automaticOwnerId: "owner-one",
      }),
      selectionSource: "map",
      sheetSnap: "collapsed",
      focusReturnOwnerId: "owner-one",
    };

    const restored = reduceExperienceChoreography(initial, {
      type: "restore-full-day",
      dayId: "day-one",
    });

    expect(restored.navigation).toBe(initial.navigation);
    expect(restored.selectionSource).toBe("map");
    expect(restored.sheetSnap).toBe("collapsed");
    expect(restored.focusReturnOwnerId).toBe("owner-one");
    expect(restored.cameraRequest).toEqual({
      kind: "fit-day",
      dayId: "day-one",
      intentId: '["camera",2,"fit-day","day-one","day-one"]',
    });
  });

  it("recenters the user without clearing truthful selection state", () => {
    const initial: ExperienceChoreographyState = {
      ...createExperienceChoreographyState({
        navigation: experience("day-one"),
        automaticOwnerId: "owner-one",
      }),
      selectionSource: "control",
      sheetSnap: "expanded",
      focusReturnOwnerId: "owner-one",
    };

    const recentered = reduceExperienceChoreography(initial, {
      type: "recenter-user",
      dayId: "day-one",
    });

    expect(recentered.navigation).toBe(initial.navigation);
    expect(recentered.selectionSource).toBe("control");
    expect(recentered.sheetSnap).toBe("expanded");
    expect(recentered.focusReturnOwnerId).toBe("owner-one");
    expect(recentered.cameraRequest).toEqual({
      kind: "recenter-user",
      dayId: "day-one",
      intentId: '["camera",2,"recenter-user","day-one","user"]',
    });
  });

  it.each([
    { type: "fit-candidate", dayId: "day-one", groupId: "" },
    { type: "fit-candidate", dayId: "day-one", groupId: "   " },
    { type: "fit-candidate", dayId: "day-two", groupId: "group-one" },
    { type: "restore-full-day", dayId: "day-two" },
    { type: "recenter-user", dayId: "day-two" },
    { type: "return-to-current", dayId: "day-one", ownerId: "" },
    { type: "return-to-current", dayId: "day-one", ownerId: "   " },
    { type: "return-to-current", dayId: "day-two", ownerId: "owner-one" },
    { type: "return-to-lodging", dayId: "day-one", ownerId: "" },
    { type: "return-to-lodging", dayId: "day-one", ownerId: "   " },
    { type: "return-to-lodging", dayId: "day-two", ownerId: "owner-one" },
  ] satisfies ExperienceChoreographyEvent[])(
    "ignores invalid or mismatched camera control %#",
    (event) => {
      const initial = createExperienceChoreographyState({
        navigation: experience("day-one"),
        automaticOwnerId: "owner-one",
      });

      expect(reduceExperienceChoreography(initial, event)).toBe(initial);
    },
  );

  it("acknowledges only the matching focus-return owner", () => {
    const initial: ExperienceChoreographyState = {
      ...createExperienceChoreographyState({
        navigation: experience("day-one"),
        automaticOwnerId: "owner-one",
      }),
      focusReturnOwnerId: "new-owner",
    };

    const stale = reduceExperienceChoreography(initial, {
      type: "focus-returned",
      ownerId: "old-owner",
    });
    expect(stale).toBe(initial);

    const acknowledged = reduceExperienceChoreography(stale, {
      type: "focus-returned",
      ownerId: "new-owner",
    });
    expect(acknowledged.focusReturnOwnerId).toBeNull();
    expect(acknowledged.cameraRequest).toBe(initial.cameraRequest);
  });

  it("opens exact neutral Home and clears outstanding camera and focus work", () => {
    const initial: ExperienceChoreographyState = {
      ...createExperienceChoreographyState({
        navigation: experience("day-one"),
        automaticOwnerId: "owner-one",
      }),
      selectionSource: "map",
      sheetSnap: "expanded",
      headerExpanded: false,
      headerRevision: 3,
      headerTransition: { id: 3, phase: "collapsing" },
      focusReturnOwnerId: "owner-one",
    };

    const home = reduceExperienceChoreography(initial, { type: "open-home" });

    expect(home).toEqual({
      ...initial,
      navigation: { surface: "home", dayId: null, ownerId: null },
      cameraRequest: null,
      focusReturnOwnerId: null,
    });
  });
});

describe("reduceExperienceChoreography sheet and header state", () => {
  it.each(["collapsed", "half", "expanded"] as const)(
    "stores the exact $snap sheet snap",
    (snap) => {
      const initial = createExperienceChoreographyState({
        navigation: experience("day-one"),
        automaticOwnerId: "owner-one",
      });

      const changed = reduceExperienceChoreography(initial, {
        type: "set-sheet-snap",
        snap,
      });

      expect(changed.sheetSnap).toBe(snap);
      expect(changed.cameraRequest).toBe(initial.cameraRequest);
    },
  );

  it("reverses header motion with monotonic IDs and ignores stale settlement", () => {
    const initial = createExperienceChoreographyState({
      navigation: experience("day-one"),
      automaticOwnerId: "owner-one",
    });

    const collapsing = reduceExperienceChoreography(initial, {
      type: "set-header-expanded",
      expanded: false,
    });
    expect(collapsing.headerExpanded).toBe(false);
    expect(collapsing.headerRevision).toBe(1);
    expect(collapsing.headerTransition).toEqual({
      id: 1,
      phase: "collapsing",
    });
    expect(collapsing.cameraRequest).toBe(initial.cameraRequest);

    const expanding = reduceExperienceChoreography(collapsing, {
      type: "set-header-expanded",
      expanded: true,
    });
    expect(expanding.headerExpanded).toBe(true);
    expect(expanding.headerRevision).toBe(2);
    expect(expanding.headerTransition).toEqual({ id: 2, phase: "expanding" });
    expect(expanding.cameraRequest).toBe(initial.cameraRequest);

    const staleSettlement = reduceExperienceChoreography(expanding, {
      type: "settle-header-transition",
      transitionId: 1,
    });
    expect(staleSettlement).toBe(expanding);

    const settled = reduceExperienceChoreography(staleSettlement, {
      type: "settle-header-transition",
      transitionId: 2,
    });
    expect(settled.headerTransition).toBeNull();
    expect(settled.headerRevision).toBe(2);

    const laterCollapse = reduceExperienceChoreography(settled, {
      type: "set-header-expanded",
      expanded: false,
    });
    expect(laterCollapse.headerRevision).toBe(3);
    expect(laterCollapse.headerTransition).toEqual({
      id: 3,
      phase: "collapsing",
    });
    expect(laterCollapse.cameraRequest).toBe(initial.cameraRequest);

    expect(
      reduceExperienceChoreography(laterCollapse, {
        type: "set-header-expanded",
        expanded: false,
      }),
    ).toBe(laterCollapse);
  });
});
