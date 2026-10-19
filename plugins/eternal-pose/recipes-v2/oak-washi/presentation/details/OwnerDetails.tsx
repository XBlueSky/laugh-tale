import { ArrowUpRight, Check, RotateCcw } from "lucide-react";
import type { BookingFactModel, ChecklistItemModel, TimelineNodeFactsModel } from "@laugh-tale-island/react";
import { catalog } from "../copy/catalog.js";
import { InlineProviderState } from "../states/InlineProviderState.js";
import type { NodeRowProps } from "../timeline/ItineraryTimeline.js";
import { ShoppingProgress } from "./ShoppingProgress.js";
import { CandidateDecision } from "./CandidateDecision.js";
import { repeatsOwnerTitle, selectOwnerDisplay } from "./select-owner-display.js";

export function Checklist({ items, editableIds, actions }: { items: readonly ChecklistItemModel[]; editableIds: readonly string[]; actions: NodeRowProps["actions"] }) {
  if (items.length === 0) return null;
  return <ul className="oak-checklist">{items.map(item => <li key={item.id} data-checklist-id={item.id}>
    {editableIds.includes(item.id) ? <label><input type="checkbox" checked={item.completed} onChange={event => actions.updateProgress({ kind: "completion", id: item.id, completed: event.currentTarget.checked })} />{item.title}</label> : <span>{item.title}</span>}
    <span>{item.completed ? catalog.progress.complete : catalog.progress.pending}</span>
  </li>)}</ul>;
}
function Fact({ label, value }: { label: string; value: string | number | undefined }) { return value === undefined ? null : <div className="oak-detail-fact"><dt>{label}</dt><dd>{value}</dd></div>; }
function TypeFacts({ facts, ...props }: NodeRowProps & { facts: TimelineNodeFactsModel }) {
  const completionIds = props.model.capabilities.progress.completionIds;
  switch (facts.kind) {
    case "transport": return <dl><Fact label={catalog.facts.mode} value={catalog.routes[facts.mode]} /><Fact label={catalog.facts.plan} value={facts.plan} /></dl>;
    case "transfer": return <dl><Fact label={catalog.facts.mode} value={facts.mode === "flight" || facts.mode === "unknown" ? catalog.routes[facts.mode] : catalog.facts[facts.mode]} /><Fact label={catalog.facts.terminal} value={facts.terminal} /></dl>;
    case "lodging": {
      const roles = { base: catalog.facts.base, "check-in": catalog.facts.checkIn, "check-out": catalog.facts.checkOut, return: catalog.facts.return };
      return <><p>{roles[facts.role]}</p><Checklist items={facts.checklist} editableIds={completionIds} actions={props.actions} /></>;
    }
    case "dining": return <dl><Fact label={catalog.facts.cuisine} value={facts.cuisine} /></dl>;
    case "shopping": return <ShoppingProgress ownerTitle={props.node.title} items={facts.items} editableIds={props.node.capabilities.shopping ? props.model.capabilities.progress.shoppingItemIds : []} actions={props.actions} />;
    case "sightseeing": return <dl><Fact label={catalog.facts.area} value={facts.area} /></dl>;
    case "experience": return <dl><Fact label={catalog.facts.duration} value={facts.durationMinutes === undefined ? undefined : catalog.routes.duration.replace("{duration}", String(facts.durationMinutes))} /></dl>;
    case "logistics": return <Checklist items={facts.checklist} editableIds={completionIds} actions={props.actions} />;
    case "custom": return <dl><Fact label={catalog.facts.customKind} value={facts.customKind} />{Object.entries(facts.data).map(([key, value]) => <Fact key={key} label={key} value={typeof value === "boolean" ? catalog.facts[value ? "true" : "false"] : value} />)}</dl>;
    default: return unhandled(facts);
  }
}
function unhandled(value: never): never { throw new Error(`Unhandled timeline facts: ${String(value)}`); }
function Booking({ booking, actionable, direct = false }: { booking: BookingFactModel; actionable: boolean; direct?: boolean }) {
  const safeUrl = booking.url && /^https?:\/\//i.test(booking.url) ? booking.url : undefined;
  return <div className={direct ? "oak-booking-facts oak-booking-direct" : "oak-booking-facts"}>
    <div className="oak-booking-copy">
      <p className="oak-booking-status">{catalog.booking[booking.status]}</p>
      {booking.reference && <dl className="oak-booking-reference"><dt>{catalog.booking.reference}</dt><dd>{booking.reference}</dd></dl>}
      {booking.arrivalBufferMinutes !== undefined && <p className="oak-booking-buffer">{catalog.facts.arrivalBuffer.replace("{minutes}", String(booking.arrivalBufferMinutes))}</p>}
    </div>
    {actionable && safeUrl && <a className="oak-booking-link oak-control" href={safeUrl} target="_blank" rel="noreferrer"><ArrowUpRight size={18} strokeWidth={1.75} aria-hidden="true" />{catalog.booking.open}</a>}
  </div>;
}
function sameBooking(a: BookingFactModel, b: BookingFactModel): boolean {
  return a.status === b.status && a.reference === b.reference && a.url === b.url && a.arrivalBufferMinutes === b.arrivalBufferMinutes;
}
export function OwnerDetails(props: NodeRowProps) {
  const { node, model, actions, bindings } = props;
  const place = node.capabilities.place ? model.places.find(place => place.ownerId === node.ownerId) : undefined;
  const decision = node.capabilities.candidateGroupId ? model.candidates.find(decision => decision.groupId === node.capabilities.candidateGroupId && decision.parentOwnerId === node.ownerId) : undefined;
  const reservations = model.reservations.filter(reservation => reservation.ownerId === node.ownerId);
  const display = selectOwnerDisplay({ title: node.title, details: node.details, reservationTitles: reservations.map(reservation => reservation.title), unresolved: node.states.includes("unresolved") || place?.place.resolution.status === "unresolved", unresolvedLabel: catalog.facts.unverifiedLocation });
  return <section className="oak-owner-details" data-details-owner={node.ownerId} aria-label={catalog.accessibleNames.openDetails}>
    {display.details.length > 0 && <ul className="oak-authored-details">{display.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul>}
    <TypeFacts facts={node.facts} {...props} />
    {place && <div className="oak-place-details" data-place-owner={node.ownerId}>
      {place.runtime.status === "ready" ? <>
        {place.runtime.formattedAddress && <p>{place.runtime.formattedAddress}</p>}
        <p data-opening-state={place.runtime.opening.status}>{place.runtime.opening.status === "unknown" ? catalog.openingHours[place.runtime.opening.reason] : catalog.openingHours[place.runtime.opening.status]}</p>
        {place.runtime.businessStatus === "temporarily-closed" && <p>{catalog.openingHours.temporarilyClosed}</p>}
        {place.runtime.businessStatus === "permanently-closed" && <p>{catalog.openingHours.permanentlyClosed}</p>}
      </> : <InlineProviderState channel="places" state={place.runtime.status === "unavailable" ? place.runtime : { status: place.runtime.status, retryable: false }} onRetry={model.capabilities.retryPlaceOwnerIds.includes(node.ownerId) ? () => actions.retryProvider("place", node.ownerId) : undefined} />}
    </div>}
    {node.booking && !reservations.some(reservation => sameBooking(node.booking!, reservation.booking)) && <Booking booking={node.booking} actionable={node.capabilities.booking} direct />}
    {reservations.map(reservation => <section className="oak-reservation" key={reservation.id}>{!repeatsOwnerTitle(reservation.title, node.title) && <h4>{reservation.title}</h4>}<Booking booking={reservation.booking} actionable={node.capabilities.booking} /></section>)}
    <div className="oak-detail-actions">
      {node.capabilities.complete && node.completion && model.capabilities.progress.completionIds.includes(node.completion.id) && <button type="button" className="oak-control oak-completion-action" onClick={() => actions.updateProgress({ kind: "completion", id: node.completion!.id, completed: !node.completion!.completed })}>{node.completion.completed ? <RotateCcw size={18} strokeWidth={1.75} aria-hidden="true" /> : <Check size={18} strokeWidth={1.75} aria-hidden="true" />}{node.completion.completed ? catalog.progress.markIncomplete : catalog.progress.markComplete}</button>}
      {node.capabilities.skip && model.capabilities.progress.skippableNodeIds.includes(node.nodeId) && <button type="button" className="oak-control" onClick={() => actions.updateProgress({ kind: "node-skipped", nodeId: node.nodeId, skipped: !node.states.includes("skipped") })}>{node.states.includes("skipped") ? catalog.progress.restore : catalog.progress.skip}</button>}
    </div>
    {decision && <CandidateDecision decision={decision} actions={actions} bindings={bindings} />}
  </section>;
}
