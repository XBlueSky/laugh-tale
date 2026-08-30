import {
  checklistCompletionKey,
  taskCompletionKey,
} from "@laugh-tale-island/core";

import type { HomeViewProps } from "../../controllers/presentation-contract";

function displayDate(date: string): string {
  return date.replaceAll("-", "/");
}

function bookingLabel(status: "confirmed" | "pending" | "none"): string {
  return status === "confirmed" ? "Confirmed" : status === "pending" ? "Pending" : "Not booked";
}

export function LiveJourneyHome({ model, actions }: HomeViewProps) {
  const pretripTasks = model.trip.tasks.filter(({ scope }) => scope === "pretrip");
  const unresolvedTask = pretripTasks.find((task) => !model.progress.completedIds.includes(taskCompletionKey(task.id)));
  const unresolvedReservation = model.trip.reservations.find(({ booking }) => booking.status !== "confirmed");
  const actionable = unresolvedTask === undefined && unresolvedReservation === undefined
    ? "All pre-departure checks are accounted for."
    : unresolvedTask === undefined
      ? `Resolve ${unresolvedReservation?.title ?? "the next reservation"}.`
      : `Finish ${unresolvedTask.title}.`;

  return (
    <>
      {model.persistence === "memory-only" ? (
        <p className="live-persistence" role="status" aria-label="Trip progress is stored on this page only" data-persistence-status="memory-only" data-contract-state="memory-only">
          Progress is stored on this page only.
        </p>
      ) : null}
      <main className="live-journey-home" data-testid="trip-home" data-surface="trip-home" data-contract-surface="home">
        <header className="live-home__mast">
          <div className="live-home__identity">
            <span className="live-kicker">LIVE JOURNEY / TRIP BOARD</span>
            <h1>{model.trip.title}</h1>
            <p className="live-home__dates">
              <time dateTime={model.trip.startDate}>{displayDate(model.trip.startDate)}</time>
              <span aria-hidden="true"> → </span>
              <time dateTime={model.trip.endDate}>{displayDate(model.trip.endDate)}</time>
              <span>{model.trip.timezone}</span>
            </p>
          </div>
          <section className="live-home__signal" aria-label="Nearest actionable fact" data-urgency={unresolvedTask === undefined && unresolvedReservation === undefined ? "settled" : "actionable"}>
            <span className="live-kicker">NEAREST ACTION</span>
            <strong>{actionable}</strong>
            <span>Based on the trip facts currently available.</span>
          </section>
        </header>

        <section className="live-readiness" aria-label="Readiness facts" data-contract-state="progress-score">
          <div>
            <span className="live-kicker">PRETRIP</span>
            <strong>{model.pretripCompletion.completed}/{model.pretripCompletion.total}</strong>
            <span>complete</span>
          </div>
          <div>
            <span className="live-kicker">CONFIRMED</span>
            <strong>{model.reservationCounts.confirmed}</strong>
            <span>reservations</span>
          </div>
          <div>
            <span className="live-kicker">OPEN</span>
            <strong>{model.reservationCounts.pending + model.reservationCounts.none}</strong>
            <span>to resolve</span>
          </div>
        </section>

        <section className="live-home__worklist" aria-labelledby="live-worklist-title" data-urgency-order="actionable-first">
          <div className="live-section-heading">
            <span className="live-kicker">WORKLIST</span>
            <h2 id="live-worklist-title">Resolve before the next move</h2>
          </div>
          {pretripTasks.length === 0 && unresolvedReservation === undefined ? (
            <p data-contract-state="empty">Nothing unresolved before departure.</p>
          ) : (
            <ol>
              {unresolvedTask === undefined ? null : (
                <li data-urgency="actionable" data-work-item={unresolvedTask.id}>
                  <span className="live-worklist__index">01</span>
                  <label>
                    <input type="checkbox" checked={model.progress.completedIds.includes(taskCompletionKey(unresolvedTask.id))} onChange={(event) => actions.setCompleted(taskCompletionKey(unresolvedTask.id), event.currentTarget.checked)} />
                    <span><strong>{unresolvedTask.title}</strong>{unresolvedTask.note === undefined ? null : <small>{unresolvedTask.note}</small>}</span>
                  </label>
                </li>
              )}
              {unresolvedReservation === undefined ? null : (
                <li data-urgency="open" data-work-item={unresolvedReservation.id}>
                  <span className="live-worklist__index">{unresolvedTask === undefined ? "01" : "02"}</span>
                  <span><strong>{unresolvedReservation.title}</strong><small>{bookingLabel(unresolvedReservation.booking.status)} reservation</small></span>
                </li>
              )}
            </ol>
          )}
        </section>

        <section className="live-home__reservations" aria-label="Reservation status">
          <div className="live-section-heading">
            <span className="live-kicker">RESERVATIONS</span>
            <h2>Known commitments</h2>
          </div>
          <ul>
            {model.trip.reservations.map((reservation) => (
              <li key={reservation.id} data-booking-status={reservation.booking.status} data-urgency={reservation.booking.status === "confirmed" ? "settled" : "open"}>
                <span>{reservation.title}</span>
                <span>{bookingLabel(reservation.booking.status)}</span>
              </li>
            ))}
          </ul>
        </section>

        <nav className="live-home__days" aria-label="Open journey day">
          {model.trip.days.map((day, index) => (
            <button key={day.id} type="button" aria-label={`Open Day ${index + 1} · ${day.title}`} data-contract-action="enter-day" data-touch-target="44" onClick={() => actions.enterDay(day.id)}>
              <span className="live-day-index">{String(index + 1).padStart(2, "0")}</span>
              <span><strong>{day.title}</strong><small>{displayDate(day.date)}</small></span>
              <span aria-hidden="true">→</span>
            </button>
          ))}
        </nav>

        {pretripTasks.length > 0 ? (
          <details className="live-home__all-tasks">
            <summary>Show all pre-departure tasks</summary>
            <ul>
              {pretripTasks.map((task) => (
                <li key={task.id}>
                  <label>
                    <input type="checkbox" checked={model.progress.completedIds.includes(taskCompletionKey(task.id))} onChange={(event) => actions.setCompleted(taskCompletionKey(task.id), event.currentTarget.checked)} />
                    <span>{task.title}</span>
                  </label>
                  {(task.children ?? []).map((child) => (
                    <label key={child.id} className="live-home__child-task">
                      <input type="checkbox" checked={model.progress.completedIds.includes(checklistCompletionKey(child.id))} onChange={(event) => actions.setCompleted(checklistCompletionKey(child.id), event.currentTarget.checked)} />
                      <span>{child.title}</span>
                    </label>
                  ))}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </main>
    </>
  );
}
