import { createElement, Fragment } from "react";

import type {
  FatalErrorViewProps,
  HomeViewProps,
  TripPresentation,
} from "../controllers/presentation-contract";
import { TripExperienceView } from "./experience/TripExperienceView";
import { SetupRequired } from "./SetupRequired";
import { TripHome } from "./home/TripHome";
import { themeMapProfile } from "./theme-map-profile";

function HomeView({ model, actions }: HomeViewProps) {
  return createElement(
    Fragment,
    null,
    model.persistence === "memory-only"
      ? createElement(
          "p",
          {
            className: "trip-progress-persistence",
            role: "status",
            "aria-label": "旅行進度僅保留在此頁面",
            "data-persistence-status": "memory-only",
          },
          "目前無法儲存進度，這次變更僅保留在此頁面。",
        )
      : null,
    createElement(TripHome, {
      trip: model.trip,
      progress: model.progress,
      onCompletedChange: actions.setCompleted,
      onEnterDay: actions.enterDay,
    }),
  );
}

function LoadingView() {
  return createElement(
    "main",
    {
      className: "trip-progress-loading",
      role: "status",
      "aria-label": "正在讀取旅行進度",
    },
    "正在讀取旅行進度",
  );
}

function FatalErrorView({ actions }: FatalErrorViewProps) {
  return createElement(
    "main",
    { role: "alert", "data-testid": "fatal-presentation-error" },
    createElement("h1", null, "Something went wrong"),
    createElement("p", null, "The trip view could not be displayed."),
    createElement(
      "button",
      {
        type: "button",
        "data-touch-target": "44",
        onClick: actions.retry,
      },
      "Retry",
    ),
  );
}

export const presentation: TripPresentation = {
  Home: HomeView,
  Experience: TripExperienceView,
  SetupRequired,
  Loading: LoadingView,
  FatalError: FatalErrorView,
  geometry: {
    header: { expanded: 148, collapsed: 72 },
    sheet: { collapsed: 128, minGap: 24 },
    desktopBreakpoint: 768,
  },
  mapProfile: themeMapProfile,
};

export { DayHeader } from "./DayHeader";
export { ItineraryTimeline } from "./ItineraryTimeline";
export { SetupRequired } from "./SetupRequired";
export { CandidateDecision } from "./decisions/CandidateDecision";
export { ShoppingStatusSelect } from "./decisions/ShoppingStatusSelect";
export { ItineraryMapView } from "./experience/ItineraryMapView";
export { ItinerarySheetView } from "./experience/ItinerarySheetView";
export { TripExperienceView } from "./experience/TripExperienceView";
export { TripHome } from "./home/TripHome";
export { ReservationPanel } from "./reservations/ReservationPanel";
export { TaskWidget } from "./tasks/TaskWidget";
export { RouteConnector } from "./timeline/RouteConnector";
export { TimelineEntry } from "./timeline/TimelineEntry";
export { themeMapProfile } from "./theme-map-profile";
