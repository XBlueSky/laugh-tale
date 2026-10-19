import type { SheetSnap } from "./sheet-geometry.js";
import type { TripNavigationState } from "./trip-navigation.js";

export type ExperienceSelectionSource =
  | "automatic"
  | "list"
  | "map"
  | "control";

export type ExperienceCameraRequest =
  | { kind: "fit-day"; dayId: string; intentId: string }
  | {
      kind: "fit-candidate";
      dayId: string;
      groupId: string;
      intentId: string;
    }
  | {
      kind: "focus-owner";
      dayId: string;
      ownerId: string;
      intentId: string;
    }
  | {
      kind: "focus-route";
      dayId: string;
      routeId: string;
      intentId: string;
    }
  | { kind: "recenter-user"; dayId: string; intentId: string };

export interface HeaderTransitionState {
  id: number;
  phase: "expanding" | "collapsing";
}

export interface ExperienceChoreographyState {
  navigation: TripNavigationState;
  selectionSource: ExperienceSelectionSource;
  sheetSnap: SheetSnap;
  headerExpanded: boolean;
  headerRevision: number;
  headerTransition: HeaderTransitionState | null;
  cameraRequest: ExperienceCameraRequest | null;
  cameraRevision: number;
  focusReturnOwnerId: string | null;
}

export interface CreateExperienceChoreographyInput {
  navigation: TripNavigationState;
  automaticOwnerId: string | null;
}

export type ExperienceChoreographyEvent =
  | { type: "select-day"; dayId: string; automaticOwnerId: string | null }
  | {
      type: "automatic-owner-changed";
      dayId: string;
      ownerId: string | null;
    }
  | {
      type: "select-node";
      dayId: string;
      nodeId: string;
      source: "list" | "map";
    }
  | {
      type: "select-route";
      dayId: string;
      routeId: string;
      source: "list" | "map";
    }
  | { type: "restore-automatic"; dayId: string; ownerId: string }
  | { type: "return-to-current"; dayId: string; ownerId: string }
  | { type: "return-to-lodging"; dayId: string; ownerId: string }
  | { type: "restore-full-day"; dayId: string }
  | { type: "fit-candidate"; dayId: string; groupId: string }
  | { type: "recenter-user"; dayId: string }
  | { type: "set-sheet-snap"; snap: SheetSnap }
  | { type: "set-header-expanded"; expanded: boolean }
  | { type: "settle-header-transition"; transitionId: number }
  | { type: "focus-returned"; ownerId: string }
  | { type: "open-home" };

function requestCamera(
  state: ExperienceChoreographyState,
  kind: ExperienceCameraRequest["kind"],
  dayId: string,
  targetId: string,
  create: (intentId: string) => ExperienceCameraRequest,
): ExperienceChoreographyState {
  const cameraRevision = state.cameraRevision + 1;
  const intentId = JSON.stringify([
    "camera",
    cameraRevision,
    kind,
    dayId,
    targetId,
  ]);
  return {
    ...state,
    cameraRevision,
    cameraRequest: create(intentId),
  };
}

function validOwner(ownerId: string | null): string | null {
  return ownerId !== null && ownerId.trim().length > 0 ? ownerId : null;
}

export function createExperienceChoreographyState(
  input: CreateExperienceChoreographyInput,
): ExperienceChoreographyState {
  const validDay =
    input.navigation.surface === "experience" &&
    input.navigation.dayId !== null &&
    input.navigation.dayId.trim().length > 0;
  const navigation: TripNavigationState = validDay
    ? {
        surface: "experience",
        dayId: input.navigation.dayId,
        ownerId: validOwner(input.automaticOwnerId),
      }
    : { surface: "home", dayId: null, ownerId: null };
  const state: ExperienceChoreographyState = {
    navigation,
    selectionSource: "automatic",
    sheetSnap: "half",
    headerExpanded: true,
    headerRevision: 0,
    headerTransition: null,
    cameraRequest: null,
    cameraRevision: 0,
    focusReturnOwnerId: null,
  };
  const dayId = navigation.dayId;
  if (dayId === null) return state;
  return requestCamera(state, "fit-day", dayId, dayId, (intentId) => ({
    kind: "fit-day",
    dayId,
    intentId,
  }));
}

export function reduceExperienceChoreography(
  state: ExperienceChoreographyState,
  event: ExperienceChoreographyEvent,
): ExperienceChoreographyState {
  switch (event.type) {
    case "select-day": {
      if (event.dayId.trim().length === 0) return state;
      const selected: ExperienceChoreographyState = {
        ...state,
        navigation: {
          surface: "experience",
          dayId: event.dayId,
          ownerId: validOwner(event.automaticOwnerId),
        },
        selectionSource: "automatic",
        sheetSnap: "half",
        focusReturnOwnerId: null,
      };
      return requestCamera(
        selected,
        "fit-day",
        event.dayId,
        event.dayId,
        (intentId) => ({
          kind: "fit-day",
          dayId: event.dayId,
          intentId,
        }),
      );
    }
    case "automatic-owner-changed": {
      if (
        state.selectionSource !== "automatic" ||
        state.navigation.dayId !== event.dayId
      ) {
        return state;
      }
      const ownerId = validOwner(event.ownerId);
      if (state.navigation.ownerId === ownerId) return state;
      return {
        ...state,
        navigation: {
          surface: "experience",
          dayId: event.dayId,
          ownerId,
        },
      };
    }
    case "select-node": {
      if (
        state.navigation.dayId !== event.dayId ||
        event.nodeId.trim().length === 0
      ) {
        return state;
      }
      const selected: ExperienceChoreographyState = {
        ...state,
        navigation: {
          surface: "experience",
          dayId: event.dayId,
          ownerId: event.nodeId,
        },
        selectionSource: event.source,
        focusReturnOwnerId: event.source === "map" ? event.nodeId : null,
      };
      return requestCamera(
        selected,
        "focus-owner",
        event.dayId,
        event.nodeId,
        (intentId) => ({
          kind: "focus-owner",
          dayId: event.dayId,
          ownerId: event.nodeId,
          intentId,
        }),
      );
    }
    case "select-route": {
      if (
        state.navigation.dayId !== event.dayId ||
        event.routeId.trim().length === 0
      ) {
        return state;
      }
      const selected: ExperienceChoreographyState = {
        ...state,
        navigation: {
          surface: "experience",
          dayId: event.dayId,
          ownerId: event.routeId,
        },
        selectionSource: event.source,
        focusReturnOwnerId: event.source === "map" ? event.routeId : null,
      };
      if (event.source === "map") return selected;
      return requestCamera(
        selected,
        "focus-route",
        event.dayId,
        event.routeId,
        (intentId) => ({
          kind: "focus-route",
          dayId: event.dayId,
          routeId: event.routeId,
          intentId,
        }),
      );
    }
    case "restore-automatic": {
      if (
        state.navigation.dayId !== event.dayId ||
        event.ownerId.trim().length === 0
      ) {
        return state;
      }
      const selected: ExperienceChoreographyState = {
        ...state,
        navigation: {
          surface: "experience",
          dayId: event.dayId,
          ownerId: event.ownerId,
        },
        selectionSource: "automatic",
        sheetSnap: "half",
        focusReturnOwnerId: null,
      };
      return requestCamera(
        selected,
        "focus-owner",
        event.dayId,
        event.ownerId,
        (intentId) => ({
          kind: "focus-owner",
          dayId: event.dayId,
          ownerId: event.ownerId,
          intentId,
        }),
      );
    }
    case "return-to-current":
    case "return-to-lodging": {
      if (
        state.navigation.dayId !== event.dayId ||
        event.ownerId.trim().length === 0
      ) {
        return state;
      }
      const selected = {
        ...state,
        navigation: {
          surface: "experience",
          dayId: event.dayId,
          ownerId: event.ownerId,
        },
        selectionSource:
          event.type === "return-to-current" ? "automatic" : "control",
        sheetSnap: "half",
        focusReturnOwnerId: null,
      } satisfies ExperienceChoreographyState;
      return requestCamera(
        selected,
        "focus-owner",
        event.dayId,
        event.ownerId,
        (intentId) => ({
          kind: "focus-owner",
          dayId: event.dayId,
          ownerId: event.ownerId,
          intentId,
        }),
      );
    }
    case "restore-full-day":
      if (state.navigation.dayId !== event.dayId) return state;
      return requestCamera(
        state,
        "fit-day",
        event.dayId,
        event.dayId,
        (intentId) => ({
          kind: "fit-day",
          dayId: event.dayId,
          intentId,
        }),
      );
    case "fit-candidate":
      if (
        state.navigation.dayId !== event.dayId ||
        event.groupId.trim().length === 0
      ) {
        return state;
      }
      return requestCamera(
        state,
        "fit-candidate",
        event.dayId,
        event.groupId,
        (intentId) => ({
          kind: "fit-candidate",
          dayId: event.dayId,
          groupId: event.groupId,
          intentId,
        }),
      );
    case "recenter-user":
      if (state.navigation.dayId !== event.dayId) return state;
      return requestCamera(
        state,
        "recenter-user",
        event.dayId,
        "user",
        (intentId) => ({
          kind: "recenter-user",
          dayId: event.dayId,
          intentId,
        }),
      );
    case "set-sheet-snap":
      return state.sheetSnap === event.snap
        ? state
        : { ...state, sheetSnap: event.snap };
    case "set-header-expanded": {
      if (event.expanded === state.headerExpanded) return state;
      const headerRevision = state.headerRevision + 1;
      return {
        ...state,
        headerExpanded: event.expanded,
        headerRevision,
        headerTransition: {
          id: headerRevision,
          phase: event.expanded ? "expanding" : "collapsing",
        },
      };
    }
    case "settle-header-transition":
      return state.headerTransition?.id === event.transitionId
        ? { ...state, headerTransition: null }
        : state;
    case "focus-returned":
      return state.focusReturnOwnerId === event.ownerId
        ? { ...state, focusReturnOwnerId: null }
        : state;
    case "open-home":
      return {
        ...state,
        navigation: { surface: "home", dayId: null, ownerId: null },
        cameraRequest: null,
        focusReturnOwnerId: null,
      };
    default:
      return state;
  }
}
