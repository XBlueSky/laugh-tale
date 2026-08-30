/* Native dialog backdrop handling intentionally uses click on the dialog itself. */
/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */
import { useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import { checklistCompletionKey, taskCompletionKey, type Booking, type CandidateOption, type Reservation, type ShoppingStatus, type TripTask } from "@laugh-tale-island/core";

import type { CandidateViewModel, ExperienceActions, ExperienceBindings, MapVisualProfile, ShoppingViewModel } from "../../controllers/presentation-contract";

function validCoordinates(option: CandidateOption): boolean {
  const coordinates = option.place?.coordinates;
  return coordinates !== undefined && Number.isFinite(coordinates.lat) && coordinates.lat >= -90 && coordinates.lat <= 90 && Number.isFinite(coordinates.lng) && coordinates.lng >= -180 && coordinates.lng <= 180;
}

export function InstrumentCandidatePanel({ model, binding, actions, candidateTitle }: { model: CandidateViewModel; binding: NonNullable<ExperienceBindings["candidate"]>; actions: Pick<ExperienceActions, "closeCandidate" | "confirmCandidate" | "previewCandidate">; candidateTitle: MapVisualProfile["candidateTitle"] }) {
  const name = `instrument-candidate-${useId().replaceAll(":", "")}`;
  const [announcement, setAnnouncement] = useState("");
  const selected = model.group.options.find(({ id }) => id === model.committedOptionId);
  return <section className="instrument-panel instrument-candidate" data-contract-surface="candidate" data-contract-state="candidate" data-candidate-mode={model.group.mode} data-expanded={model.open ? "true" : "false"} data-committed-owner-id={model.committedOptionId} aria-label="Candidate choice">
    <header className="instrument-panel__header"><div><span className="instrument-kicker">DECISION CHANNEL</span><h2>{model.sourceNode.title}</h2>{selected === undefined ? null : <p>{model.open ? "Draft choice" : "Selected"} · {selected.title}</p>}</div><button type="button" aria-label={model.open ? `Close ${model.sourceNode.title} comparison` : `Open ${model.sourceNode.title} comparison`} data-contract-action="candidate-toggle" data-touch-target="44" {...binding.getTriggerProps()}>{model.open ? "CLOSE" : "OPEN"}</button></header>
    {model.group.mode === "single" ? <fieldset hidden={!model.open} className="instrument-choice-list"><legend>Options for {model.sourceNode.title}</legend>{model.group.options.map((option, index) => { const label = candidateTitle(model.sequenceNumber, index, option); return <label key={option.id} className="instrument-choice"><input ref={binding.registerOption(option.id)} type="radio" name={name} value={option.id} aria-label={label} data-contract-owner="candidate-option" data-owner-id={option.id} checked={model.draftOptionId === option.id} onChange={() => actions.previewCandidate(option.id)} /><span><b>{label}</b><small>{option.title}{validCoordinates(option) ? "" : " · Location unavailable"}</small></span></label>; })}<div className="instrument-panel__actions"><button type="button" data-contract-action="candidate-cancel" data-touch-target="44" onClick={actions.closeCandidate}>Cancel</button><button type="button" data-contract-action="candidate-commit" data-touch-target="44" disabled={model.draftOptionId === undefined} onClick={() => { const option = model.group.options.find(({ id }) => id === model.draftOptionId); actions.confirmCandidate(); setAnnouncement(`Selected ${option?.title ?? "candidate"}`); }}>Confirm</button></div></fieldset> : <ul hidden={!model.open} className="instrument-choice-list" aria-label={model.sourceNode.title}>{model.group.options.map((option, index) => { const label = candidateTitle(model.sequenceNumber, index, option); return <li key={option.id}>{validCoordinates(option) ? <button ref={binding.registerOption(option.id)} type="button" data-contract-owner="candidate-option" data-owner-id={option.id} data-touch-target="44" aria-label={`Locate ${label}`} onClick={() => actions.previewCandidate(option.id)}>{label}</button> : <span>{label} · Location unavailable</span>}</li>; })}</ul>}
    <span className="instrument-visually-hidden" role="status" aria-live="polite">{announcement}</span>
  </section>;
}

const shoppingOptions: readonly { value: ShoppingStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "purchased", label: "Purchased" },
  { value: "unavailable", label: "Unavailable" },
  { value: "skipped", label: "Skipped" },
];

export function InstrumentShoppingPanel({ model, onChange }: { model: ShoppingViewModel; onChange: ExperienceActions["setShoppingStatus"] }) {
  return <section className="instrument-panel instrument-shopping" data-surface="shopping-progress" data-contract-state="shopping" aria-label={`${model.node.title} shopping list`}><header className="instrument-panel__header"><div><span className="instrument-kicker">SUPPLY CHANNEL</span><h2>{model.node.title}</h2></div><span>{model.node.payload.items.length} items</span></header><ul>{model.node.payload.items.map((item) => <li key={item.id}><span>{item.title}</span><select aria-label={`${item.title} shopping status`} data-touch-target="44" value={model.statuses[item.id] ?? item.initialStatus ?? "pending"} onChange={(event) => onChange(item.id, event.currentTarget.value as ShoppingStatus)}>{shoppingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></li>)}</ul></section>;
}

function bookingLabel(status: Booking["status"]): string {
  return status === "confirmed" ? "Confirmed" : status === "pending" ? "Pending" : "Not booked";
}

function httpsHref(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : undefined; } catch { return undefined; }
}

export function InstrumentReservationPanel({ reservations }: { reservations: readonly Reservation[] }) {
  const id = useId().replaceAll(":", "");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => () => { if (dialogRef.current?.open) dialogRef.current.close(); }, []);
  const close = (): void => { if (dialogRef.current?.open) dialogRef.current.close(); setRevealed(new Set()); triggerRef.current?.focus(); };
  const open = (): void => { const dialog = dialogRef.current; if (dialog === null || dialog.open) return; if (typeof dialog.showModal !== "function") { setUnsupported(true); return; } try { dialog.showModal(); setUnsupported(false); } catch { setUnsupported(true); } };
  return <section className="instrument-utility" data-surface="reservations" data-contract-surface="reservations" data-contract-state="reservation"><button ref={triggerRef} type="button" aria-label="Open reservation information" data-contract-action="open-reservations" data-touch-target="44" onClick={open}>RES</button>{unsupported ? <span role="status">Reservation information cannot open in this browser.</span> : null}<dialog ref={dialogRef} className="instrument-dialog" data-contract-dialog="reservations" aria-labelledby={`instrument-reservation-${id}`} onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event: ReactMouseEvent<HTMLDialogElement>) => { if (event.target === event.currentTarget) close(); }}><section className="instrument-dialog__surface"><header><div><span className="instrument-kicker">RESERVATION CHANNEL</span><h2 id={`instrument-reservation-${id}`}>Reservation information</h2></div><button type="button" aria-label="Close reservation information" data-contract-action="close-reservations" data-touch-target="44" onClick={close}>×</button></header>{reservations.length === 0 ? <p>No reservation information.</p> : <ul>{reservations.map((reservation) => { const href = httpsHref(reservation.booking.url); const isRevealed = revealed.has(reservation.id); return <li key={reservation.id} data-booking-status={reservation.booking.status}><strong>{reservation.title}</strong><span>{bookingLabel(reservation.booking.status)}</span>{reservation.booking.arrivalBufferMinutes === undefined ? null : <span>Arrive {reservation.booking.arrivalBufferMinutes} min early</span>}{reservation.booking.reference === undefined ? null : isRevealed ? <code data-contract-owner="reservation-reference" data-owner-id={reservation.id} data-state="revealed">{reservation.booking.reference}</code> : <button type="button" aria-label={`Show ${reservation.title} reservation code`} data-contract-action="reveal-reservation" data-owner-id={reservation.id} data-touch-target="44" onClick={() => setRevealed((current) => new Set([...current, reservation.id]))}>Show reservation code</button>}{href === undefined ? null : <a href={href} target="_blank" rel="noreferrer noopener" aria-label={`Open ${reservation.title} reservation page`} data-touch-target="44">Open reservation page</a>}</li>; })}</ul>}</section></dialog></section>;
}

export function InstrumentTaskPanel({ dayTitle, tasks, completedIds, onCompletedChange }: { dayTitle: string; tasks: readonly TripTask[]; completedIds: ReadonlySet<string>; onCompletedChange: (id: string, completed: boolean) => void }) {
  const id = useId().replaceAll(":", "");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => () => { if (dialogRef.current?.open) dialogRef.current.close(); }, []);
  const close = (): void => { if (dialogRef.current?.open) dialogRef.current.close(); triggerRef.current?.focus(); };
  const open = (): void => { const dialog = dialogRef.current; if (dialog === null || dialog.open) return; if (typeof dialog.showModal !== "function") { setUnsupported(true); return; } try { dialog.showModal(); setUnsupported(false); } catch { setUnsupported(true); } };
  return <section className="instrument-utility" data-surface="day-tasks" data-contract-surface="day-tasks" data-contract-state="task"><button ref={triggerRef} type="button" aria-label={`Open tasks for ${dayTitle}`} data-contract-action="open-tasks" data-touch-target="44" onClick={open}>TASK</button>{unsupported ? <span role="status">Day tasks cannot open in this browser.</span> : null}<dialog ref={dialogRef} className="instrument-dialog" data-contract-dialog="tasks" aria-labelledby={`instrument-task-${id}`} onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event: ReactMouseEvent<HTMLDialogElement>) => { if (event.target === event.currentTarget) close(); }}><section className="instrument-dialog__surface"><header><div><span className="instrument-kicker">TASK CHANNEL</span><h2 id={`instrument-task-${id}`}>Tasks for {dayTitle}</h2></div><button type="button" aria-label="Close day tasks" data-contract-action="close-tasks" data-touch-target="44" onClick={close}>×</button></header><ul className="instrument-task-list">{tasks.length === 0 ? <li>No tasks for this mission.</li> : tasks.map((task, taskIndex) => { const taskKey = taskCompletionKey(task.id); const children = task.children ?? []; const expanded = expandedIds.has(task.id); const childrenId = `instrument-task-children-${id}-${taskIndex}`; return <li key={task.id}><div className="instrument-task-row"><label><input type="checkbox" data-contract-owner="task" data-owner-id={taskKey} checked={completedIds.has(taskKey)} onChange={(event) => onCompletedChange(taskKey, event.currentTarget.checked)} /><span>{task.title}</span></label>{children.length >= 2 ? <button type="button" aria-label={`${expanded ? "Hide" : "Show"} ${task.title} subtasks`} aria-controls={childrenId} aria-expanded={expanded} data-touch-target="44" onClick={() => setExpandedIds((current) => { const next = new Set(current); if (next.has(task.id)) next.delete(task.id); else next.add(task.id); return next; })}>{expanded ? "−" : "+"}</button> : null}</div>{task.note === undefined ? null : <p>{task.note}</p>}{children.length === 0 ? null : <ul id={childrenId} hidden={children.length >= 2 && !expanded}>{children.map((child) => <li key={child.id}><label><input type="checkbox" checked={completedIds.has(checklistCompletionKey(child.id))} onChange={(event) => onCompletedChange(checklistCompletionKey(child.id), event.currentTarget.checked)} /><span>{child.title}</span></label></li>)}</ul>}</li>; })}</ul></section></dialog></section>;
}
