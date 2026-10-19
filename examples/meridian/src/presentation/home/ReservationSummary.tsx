import { ArrowRight } from "lucide-react";
import type { BookingFactModel, HomeReservationModel, TripActions } from "@laugh-tale-island/react";
import { catalog } from "../copy/catalog.js";

// Home has no booking-action capability. URLs remain authored facts here.
export function HomeBookingFacts({ booking }: { booking: BookingFactModel }) {
  return <div className="oak-home-booking">
    <p className="oak-home-booking-status">{catalog.booking[booking.status]}</p>
    {booking.reference !== undefined && <dl className="oak-home-booking-reference"><dt>{catalog.booking.reference}</dt><dd>{booking.reference}</dd></dl>}
    {booking.arrivalBufferMinutes !== undefined && <p className="oak-home-booking-buffer">{catalog.facts.arrivalBuffer.replace("{minutes}", String(booking.arrivalBufferMinutes))}</p>}
    {booking.url !== undefined && <p className="oak-home-booking-url oak-copy-secondary">{booking.url}</p>}
  </div>;
}

export function ReservationSummary({ reservations, actions }: { reservations: readonly HomeReservationModel[]; actions: Pick<TripActions, "openReservation"> }) {
  if (reservations.length === 0) return null;
  return <section className="oak-home-section" aria-label={catalog.home.reservations}>
    <h2>{catalog.home.reservations}</h2>
    <ul className="oak-home-facts-list">{reservations.map(reservation => <li key={reservation.id} data-home-reservation-id={reservation.id}>
      <div className="oak-home-reservation-heading"><h3>{reservation.title}</h3>{reservation.destination && <button className="oak-control oak-home-reservation-open" type="button" aria-label={`${catalog.home.openDay} · ${reservation.title}`} onClick={() => actions.openReservation(reservation.id)}><ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" /></button>}</div><HomeBookingFacts booking={reservation.booking} />
    </li>)}</ul>
  </section>;
}
