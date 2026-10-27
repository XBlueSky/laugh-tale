import { useMemo } from "react";

import { checklistCompletionKey, taskCompletionKey, type Trip } from "@laugh-tale-island/core";
import type { TripProgressController } from "@laugh-tale-island/react";

import type { HomeViewProps } from "./presentation-contract";

type HydratedProgressController = Pick<
  TripProgressController,
  "progress" | "persistenceStatus" | "setCompleted"
>;

export function useHomeController(
  trip: Trip,
  progressController: HydratedProgressController,
  enterDay: (dayId: string) => void,
): HomeViewProps {
  const { progress, persistenceStatus, setCompleted } = progressController;

  return useMemo(() => {
    const pretripCompletionIds = trip.tasks
      .filter(({ scope }) => scope === "pretrip")
      .flatMap((task) => [
        taskCompletionKey(task.id),
        ...(task.children ?? []).map((child) => checklistCompletionKey(child.id)),
      ]);
    const completed = pretripCompletionIds.filter((id) => progress.completedIds.includes(id)).length;
    const reservationCounts = trip.reservations.reduce(
      (counts, { booking }) => ({
        ...counts,
        [booking.status]: counts[booking.status] + 1,
      }),
      { confirmed: 0, pending: 0, none: 0 },
    );

    return {
      model: {
        trip,
        progress,
        pretripCompletion: { completed, total: pretripCompletionIds.length },
        reservationCounts,
        persistence: persistenceStatus,
      },
      actions: { setCompleted, enterDay },
    };
  }, [enterDay, persistenceStatus, progress, setCompleted, trip]);
}
