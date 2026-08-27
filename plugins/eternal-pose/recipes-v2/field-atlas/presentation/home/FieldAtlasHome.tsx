import { useId } from "react";

import {
  checklistCompletionKey,
  taskCompletionKey,
} from "@laugh-tale-island/core";

import type { HomeViewProps } from "../../controllers/presentation-contract";

function displayDate(date: string): string {
  return date.replaceAll("-", "/");
}

function statusLabel(status: "confirmed" | "pending" | "none"): string {
  return status === "confirmed"
    ? "Confirmed"
    : status === "pending"
      ? "Pending"
      : "Not booked";
}

export function FieldAtlasHome({ model, actions }: HomeViewProps) {
  const id = useId().replaceAll(":", "");
  const pretripTasks = model.trip.tasks.filter(({ scope }) => scope === "pretrip");

  return (
    <>
      {model.persistence === "memory-only" ? (
        <p
          className="atlas-persistence"
          role="status"
          aria-label="旅行進度僅保留在此頁面"
          data-persistence-status="memory-only"
        >
          Progress is stored on this page only.
        </p>
      ) : null}
      <main className="atlas-home" data-testid="trip-home" data-surface="trip-home">
        <header className="atlas-home__mast">
          <div className="atlas-home__identity">
            <span className="atlas-key">FIELD ATLAS</span>
            <h1>{model.trip.title}</h1>
            <p className="atlas-home__dates">
              <time dateTime={model.trip.startDate}>{displayDate(model.trip.startDate)}</time>
              <span aria-hidden="true"> / </span>
              <time dateTime={model.trip.endDate}>{displayDate(model.trip.endDate)}</time>
              <span>{model.trip.timezone}</span>
            </p>
          </div>
          <section className="atlas-route-overview" aria-label="Route overview">
            <span className="atlas-route-overview__axis" aria-hidden="true" />
            <ol>
              {model.trip.days.map((day, index) => (
                <li key={day.id}>
                  <span className="stop-number">{String(index + 1).padStart(2, "0")}</span>
                  <span>{day.title}</span>
                </li>
              ))}
            </ol>
          </section>
        </header>

        <section className="atlas-readiness" aria-label="Readiness facts">
          <div>
            <span className="atlas-key">PRETRIP</span>
            <strong>{model.pretripCompletion.completed}/{model.pretripCompletion.total}</strong>
            <span>complete</span>
          </div>
          <div>
            <span className="atlas-key">CONFIRMED</span>
            <strong>{model.reservationCounts.confirmed}</strong>
            <span>reservations</span>
          </div>
          <div>
            <span className="atlas-key">PENDING</span>
            <strong>{model.reservationCounts.pending}</strong>
            <span>reservations</span>
          </div>
        </section>

        <section className="atlas-home__pretrip" aria-labelledby={`atlas-pretrip-${id}`}>
          <h2 id={`atlas-pretrip-${id}`}>旅前準備</h2>
          {pretripTasks.length === 0 ? (
            <p>No pretrip tasks.</p>
          ) : (
            <ul>
              {pretripTasks.map((task) => {
                const taskKey = taskCompletionKey(task.id);
                return (
                  <li key={task.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={model.progress.completedIds.includes(taskKey)}
                        onChange={(event) =>
                          actions.setCompleted(taskKey, event.currentTarget.checked)
                        }
                      />
                      <span>{task.title}</span>
                    </label>
                    {task.note === undefined ? null : <p>{task.note}</p>}
                    {(task.children ?? []).length === 0 ? null : (
                      <ul>
                        {(task.children ?? []).map((child) => {
                          const childKey = checklistCompletionKey(child.id);
                          return (
                            <li key={child.id}>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={model.progress.completedIds.includes(childKey)}
                                  onChange={(event) =>
                                    actions.setCompleted(childKey, event.currentTarget.checked)
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

        <section className="atlas-reservation-ledger" aria-label="Reservation ledger">
          <h2>訂位</h2>
          <p>
            {model.reservationCounts.confirmed} 已確認 / {model.reservationCounts.pending} 待確認 / {model.reservationCounts.none} 未訂位
          </p>
          <ol>
            {model.trip.reservations.map((reservation) => (
              <li key={reservation.id} data-booking-status={reservation.booking.status}>
                <span>{reservation.title}</span>
                <span>{statusLabel(reservation.booking.status)}</span>
              </li>
            ))}
          </ol>
        </section>

        <nav className="atlas-index atlas-home__days" aria-label="進入每日行程">
          {model.trip.days.map((day, index) => (
            <button
              key={day.id}
              type="button"
              aria-label={`進入 Day ${index + 1} · ${day.title}`}
              data-touch-target="44"
              onClick={() => actions.enterDay(day.id)}
            >
              <span className="stop-number">{String(index + 1).padStart(2, "0")}</span>
              <span>{day.title}</span>
              <time dateTime={day.date}>{day.date.slice(5).replace("-", "/")}</time>
            </button>
          ))}
        </nav>
      </main>
    </>
  );
}
