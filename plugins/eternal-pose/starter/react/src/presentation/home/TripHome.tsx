import { ChevronDown, ChevronUp, MapPinned } from "lucide-react";
import { useId, useState } from "react";

import type { Trip } from "@laugh-tale-island/core";
import { checklistCompletionKey, taskCompletionKey, type TripProgressV1 } from "@laugh-tale-island/core";
import { ReservationPanel } from "../reservations/ReservationPanel";

export interface TripHomeProps {
  trip: Trip;
  progress: TripProgressV1;
  onCompletedChange: (id: string, completed: boolean) => void;
  onEnterDay: (dayId: string) => void;
}

function displayDate(date: string): string {
  return date.replaceAll("-", "/");
}

export function TripHome({
  trip,
  progress,
  onCompletedChange,
  onEnterDay,
}: TripHomeProps) {
  const generatedId = useId().replaceAll(":", "");
  const [expandedTaskIds, setExpandedTaskIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const pretripTasks = trip.tasks.filter(({ scope }) => scope === "pretrip");
  const pretripCompletionIds = pretripTasks.flatMap((task) => [
    taskCompletionKey(task.id),
    ...(task.children ?? []).map((child) => checklistCompletionKey(child.id)),
  ]);
  const completedPretrip = pretripCompletionIds.filter((id) =>
    progress.completedIds.includes(id),
  ).length;
  const confirmedReservations = trip.reservations.filter(
    ({ booking }) => booking.status === "confirmed",
  ).length;
  const pendingReservations = trip.reservations.filter(
    ({ booking }) => booking.status === "pending",
  ).length;
  const unbookedReservations = trip.reservations.filter(
    ({ booking }) => booking.status === "none",
  ).length;

  const toggleTask = (taskId: string): void => {
    setExpandedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  return (
    <main className="trip-home" data-testid="trip-home" data-surface="trip-home">
      <header className="trip-home__identity">
        <p className="trip-home__eyebrow">Trip overview</p>
        <h1>{trip.title}</h1>
        <p className="trip-home__dates">
          <time dateTime={trip.startDate}>{displayDate(trip.startDate)}</time>
          <span aria-hidden="true">–</span>
          <time dateTime={trip.endDate}>{displayDate(trip.endDate)}</time>
        </p>
      </header>

      <section className="trip-home__pretrip" aria-labelledby={`pretrip-title-${generatedId}`}>
        <header className="trip-home__section-header">
          <h2 id={`pretrip-title-${generatedId}`}>旅前準備</h2>
          <span>
            {completedPretrip} / {pretripCompletionIds.length} 旅前事項完成
          </span>
        </header>
        {pretripTasks.length === 0 ? (
          <p>目前沒有旅前事項</p>
        ) : (
          <ul className="trip-home__task-list">
            {pretripTasks.map((task, taskIndex) => {
              const taskKey = taskCompletionKey(task.id);
              const children = task.children ?? [];
              const canDisclose = children.length >= 2;
              const expanded = expandedTaskIds.has(task.id);
              const childrenId = `pretrip-children-${generatedId}-${taskIndex}`;
              return (
                <li key={`pretrip-task:${task.id}`} className="trip-home__task">
                  <div className="trip-home__task-primary">
                    <label>
                      <input
                        type="checkbox"
                        checked={progress.completedIds.includes(taskKey)}
                        onChange={(event) =>
                          onCompletedChange(taskKey, event.currentTarget.checked)
                        }
                      />
                      <span>{task.title}</span>
                    </label>
                    {canDisclose ? (
                      <button
                        type="button"
                        className="icon-control trip-home__task-disclosure"
                        aria-label={`${expanded ? "隱藏" : "顯示"} ${task.title} 子項`}
                        aria-controls={childrenId}
                        aria-expanded={expanded}
                        data-touch-target="44"
                        onClick={() => toggleTask(task.id)}
                      >
                        {expanded ? (
                          <ChevronUp aria-hidden="true" size={18} strokeWidth={1.8} />
                        ) : (
                          <ChevronDown aria-hidden="true" size={18} strokeWidth={1.8} />
                        )}
                      </button>
                    ) : null}
                  </div>
                  {task.note === undefined ? null : (
                    <p className="trip-home__task-note">{task.note}</p>
                  )}
                  {children.length === 0 ? null : (
                    <ul
                      id={childrenId}
                      className="trip-home__task-children"
                      hidden={canDisclose && !expanded}
                    >
                      {children.map((child) => {
                        const childKey = checklistCompletionKey(child.id);
                        return (
                          <li key={`pretrip-child:${child.id}`}>
                            <label>
                              <input
                                type="checkbox"
                                checked={progress.completedIds.includes(childKey)}
                                onChange={(event) =>
                                  onCompletedChange(childKey, event.currentTarget.checked)
                                }
                              />
                              <span>{child.title}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="trip-home__reservations" aria-label="訂位摘要">
        <div>
          <h2>訂位</h2>
          <p>
            {confirmedReservations} 已確認 · {pendingReservations} 待確認 ·{" "}
            {unbookedReservations} 未訂位
          </p>
        </div>
        <ReservationPanel reservations={trip.reservations} />
      </section>

      <nav className="trip-home__days" aria-label="進入每日行程">
        {trip.days.map((day, index) => (
          <button
            key={`home-day:${day.id}`}
            type="button"
            className="trip-home__day-action"
            aria-label={`進入 Day ${index + 1} · ${day.title}`}
            data-touch-target="44"
            onClick={() => onEnterDay(day.id)}
          >
            <MapPinned aria-hidden="true" size={18} strokeWidth={1.8} />
            <span>Day {index + 1} · {day.title}</span>
            <time dateTime={day.date}>{day.date.slice(5).replace("-", "/")}</time>
          </button>
        ))}
      </nav>
    </main>
  );
}
