import { checklistCompletionKey, taskCompletionKey } from "@laugh-tale-island/core";

import type { HomeViewProps } from "../../controllers/presentation-contract";
import { InstrumentRack } from "../components/InstrumentRack";

function dateLabel(date: string): string {
  return date.replaceAll("-", "/");
}

function bookingLabel(status: "confirmed" | "pending" | "none"): string {
  return status === "confirmed" ? "Confirmed" : status === "pending" ? "Pending" : "Not booked";
}

export function PocketInstrumentHome({ model, actions }: HomeViewProps) {
  const pretripTasks = model.trip.tasks.filter(({ scope }) => scope === "pretrip");
  return (
    <>
      {model.persistence === "memory-only" ? <p className="instrument-persistence" role="status" aria-label="Trip progress is stored on this page only" data-persistence-status="memory-only" data-contract-state="memory-only">Progress is stored on this page only.</p> : null}
      <main className="pocket-instrument-home instrument-rack" data-testid="trip-home" data-surface="trip-home" data-contract-surface="home">
        <InstrumentRack>
        <header className="instrument-rack__header">
          <div className="instrument-rack__brand"><span className="instrument-kicker">POCKET INSTRUMENT / TRIP UNIT</span><h1>{model.trip.title}</h1><p><time dateTime={model.trip.startDate}>{dateLabel(model.trip.startDate)}</time><span aria-hidden="true"> → </span><time dateTime={model.trip.endDate}>{dateLabel(model.trip.endDate)}</time><span>{model.trip.timezone}</span></p></div>
          <div className="instrument-rack__lamp" data-status-lamp="ready" data-status-text="Trip facts loaded"><span className="status-lamp" aria-hidden="true" /> <strong>READY</strong><span>Trip facts loaded</span></div>
        </header>

        <section className="instrument-readout" aria-label="Trip readiness" data-signal-color="active" data-contract-state="progress-score">
          <div className="instrument-readout__label"><span className="instrument-kicker">PRIMARY READOUT</span><h2>Readiness</h2><p>Only stored trip facts are shown.</p></div>
          <div className="instrument-readout__value"><strong>{model.pretripCompletion.completed}/{model.pretripCompletion.total}</strong><span>pretrip tasks complete</span></div>
          <div className="instrument-readout__value"><strong>{model.reservationCounts.confirmed}</strong><span>confirmed reservations</span></div>
          <div className="instrument-readout__value"><strong>{model.reservationCounts.pending + model.reservationCounts.none}</strong><span>open commitments</span></div>
        </section>

        <section className="instrument-module instrument-module--tasks" aria-labelledby="instrument-task-title">
          <div className="instrument-module__heading"><span className="instrument-kicker">CHANNEL 01</span><h2 id="instrument-task-title">Preparation</h2></div>
          {pretripTasks.length === 0 ? <p data-contract-state="empty">No preparation tasks.</p> : <ul>{pretripTasks.map((task) => <li key={task.id}><label><input type="checkbox" checked={model.progress.completedIds.includes(taskCompletionKey(task.id))} onChange={(event) => actions.setCompleted(taskCompletionKey(task.id), event.currentTarget.checked)} /><span>{task.title}</span></label>{(task.children ?? []).map((child) => <label key={child.id} className="instrument-child"><input type="checkbox" checked={model.progress.completedIds.includes(checklistCompletionKey(child.id))} onChange={(event) => actions.setCompleted(checklistCompletionKey(child.id), event.currentTarget.checked)} /><span>{child.title}</span></label>)}</li>)}</ul>}
        </section>

        <section className="instrument-module instrument-module--reservations" aria-labelledby="instrument-reservation-title">
          <div className="instrument-module__heading"><span className="instrument-kicker">CHANNEL 02</span><h2 id="instrument-reservation-title">Reservations</h2></div>
          {model.trip.reservations.length === 0 ? <p data-contract-state="empty">No reservation data.</p> : <ul>{model.trip.reservations.map((reservation) => <li key={reservation.id} data-booking-status={reservation.booking.status}><span>{reservation.title}</span><span>{bookingLabel(reservation.booking.status)}</span></li>)}</ul>}
        </section>

        <nav className="instrument-channel-selector" aria-label="Select journey channel">
          {model.trip.days.map((day, index) => <button key={day.id} type="button" data-contract-action="enter-day" data-touch-target="44" aria-label={`Open Day ${index + 1} · ${day.title}`} onClick={() => actions.enterDay(day.id)}><span className="channel-number">{String(index + 1).padStart(2, "0")}</span><span><strong>{day.title}</strong><small>{dateLabel(day.date)}</small></span><span aria-hidden="true">↗</span></button>)}
        </nav>
        </InstrumentRack>
      </main>
    </>
  );
}
