import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import {
  checklistCompletionKey,
  taskCompletionKey,
  type Booking,
  type CandidateOption,
  type Reservation,
  type ShoppingStatus,
  type TripTask,
} from "@laugh-tale-island/core";

import type {
  CandidateViewModel,
  ExperienceActions,
  ExperienceBindings,
  MapVisualProfile,
  ShoppingViewModel,
} from "../../controllers/presentation-contract";

function hasCoordinates(option: CandidateOption): boolean {
  const coordinates = option.place?.coordinates;
  return coordinates !== undefined &&
    Number.isFinite(coordinates.lat) &&
    coordinates.lat >= -90 && coordinates.lat <= 90 &&
    Number.isFinite(coordinates.lng) &&
    coordinates.lng >= -180 && coordinates.lng <= 180;
}

export function ArcadeCandidatePanel({
  model,
  binding,
  actions,
  candidateTitle,
}: {
  model: CandidateViewModel;
  binding: NonNullable<ExperienceBindings["candidate"]>;
  actions: Pick<ExperienceActions, "closeCandidate" | "confirmCandidate" | "openCandidate" | "previewCandidate">;
  candidateTitle: MapVisualProfile["candidateTitle"];
}) {
  const radioName = `arcade-candidate-${useId().replaceAll(":", "")}`;
  const [announcement, setAnnouncement] = useState("");
  const committed = model.group.options.find(({ id }) => id === model.committedOptionId);
  const triggerLabel = model.group.mode === "browse"
    ? `${model.open ? "Hide" : "View"} ${model.sourceNode.title} candidates`
    : model.open
      ? `Hide ${model.sourceNode.title} candidates`
      : committed === undefined
        ? `Compare ${model.sourceNode.title}`
        : `Compare ${model.sourceNode.title} again`;

  return (
    <section
      className="arcade-panel candidate-panel"
      data-contract-surface="candidate"
      data-contract-state="candidate"
      data-candidate-mode={model.group.mode}
      data-expanded={model.open ? "true" : "false"}
      data-committed-owner-id={model.committedOptionId}
      aria-label="Mission choice"
    >
      <header className="arcade-panel__header">
        <span className="arcade-key">CHOICE</span>
        <div>
          <h3>{model.sourceNode.title}</h3>
          {model.group.mode === "single" && committed !== undefined ? (
            <p>{model.open ? "Currently selected" : "Selected"} · {committed.title}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="arcade-panel__trigger"
          aria-label={triggerLabel}
          data-contract-action="candidate-toggle"
          data-touch-target="44"
          {...binding.getTriggerProps()}
        >
          {triggerLabel}
        </button>
      </header>

      {model.group.mode === "single" ? (
        <fieldset className="arcade-panel__options" hidden={!model.open}>
          <legend>{model.sourceNode.title}</legend>
          {model.group.options.map((option, index) => {
            const label = candidateTitle(model.sequenceNumber, index, option);
            return (
              <label key={option.id} className="arcade-panel__option">
                <input
                  ref={binding.registerOption(option.id)}
                  type="radio"
                  name={radioName}
                  value={option.id}
                  aria-label={label}
                  data-contract-owner="candidate-option"
                  data-owner-id={option.id}
                  checked={model.draftOptionId === option.id}
                  onChange={() => actions.previewCandidate(option.id)}
                />
                <span className="mission-number">{label.slice(0, label.indexOf(" ·"))}</span>
                <span>{option.title}</span>
                {hasCoordinates(option) ? null : <small>Location unavailable</small>}
              </label>
            );
          })}
          <div className="arcade-panel__actions">
            <button
              type="button"
              data-touch-target="44"
              data-contract-action="candidate-cancel"
              aria-label="Cancel candidate comparison"
              onClick={actions.closeCandidate}
            >
              Cancel
            </button>
            <button
              type="button"
              data-touch-target="44"
              data-contract-action="candidate-commit"
              disabled={model.draftOptionId === undefined}
              aria-label={model.draftOptionId === undefined ? "Confirm candidate selection" : "Confirm selection"}
              onClick={() => {
                const selected = model.group.options.find(({ id }) => id === model.draftOptionId);
                actions.confirmCandidate();
                setAnnouncement(`Selected ${selected?.title ?? "candidate"}`);
              }}
            >
              Confirm
            </button>
          </div>
        </fieldset>
      ) : null}

      {model.group.mode === "browse" ? (
        <ul className="arcade-panel__list" aria-label={model.sourceNode.title} hidden={!model.open}>
          {model.group.options.map((option, index) => {
            const label = candidateTitle(model.sequenceNumber, index, option);
            return (
              <li key={option.id}>
                {hasCoordinates(option) ? (
                  <button
                    ref={binding.registerOption(option.id)}
                    type="button"
                    data-contract-owner="candidate-option"
                    data-owner-id={option.id}
                    data-touch-target="44"
                    aria-label={`Locate ${label}`}
                    onClick={() => actions.previewCandidate(option.id)}
                  >
                    {label}
                  </button>
                ) : (
                  <span>{label} · Location unavailable</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      <span className="arcade-visually-hidden" role="status" aria-live="polite">{announcement}</span>
    </section>
  );
}

const shoppingOptions: readonly { value: ShoppingStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "purchased", label: "Purchased" },
  { value: "unavailable", label: "Unavailable" },
  { value: "skipped", label: "Skipped" },
];

export function ArcadeShoppingPanel({
  model,
  onChange,
}: {
  model: ShoppingViewModel;
  onChange: ExperienceActions["setShoppingStatus"];
}) {
  return (
    <section className="arcade-panel arcade-shopping" data-contract-state="shopping" data-surface="shopping-progress" aria-label={`${model.node.title} shopping list`}>
      <header className="arcade-panel__header">
        <span className="arcade-key">SUPPLY</span>
        <h3>{model.node.title}</h3>
      </header>
      <ul>
        {model.node.payload.items.map((item) => (
          <li key={item.id} data-shopping-item={item.id}>
            <span>{item.title}</span>
            <select
              aria-label={`${item.title} shopping status`}
              data-touch-target="44"
              value={model.statuses[item.id] ?? item.initialStatus ?? "pending"}
              onChange={(event) => onChange(item.id, event.currentTarget.value as ShoppingStatus)}
            >
              {shoppingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </li>
        ))}
      </ul>
    </section>
  );
}

function bookingStatusLabel(status: Booking["status"]): string {
  return status === "confirmed" ? "Confirmed" : status === "pending" ? "Pending" : "Not booked";
}

function safeHttpsUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function ArcadeReservationPanel({ reservations }: { reservations: readonly Reservation[] }) {
  const id = useId().replaceAll(":", "");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    const dialog = dialogRef.current;
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  const close = (): void => {
    if (dialogRef.current?.open) dialogRef.current.close();
    setRevealed(new Set());
    triggerRef.current?.focus();
  };

  const open = (): void => {
    const dialog = dialogRef.current;
    if (dialog === null || dialog.open) return;
    if (typeof dialog.showModal !== "function") {
      setUnsupported(true);
      return;
    }
    try {
      dialog.showModal();
      setUnsupported(false);
    } catch {
      setUnsupported(true);
    }
  };

  return (
    <section className="arcade-panel arcade-utility" data-surface="reservations" data-contract-surface="reservations" data-contract-state="reservation">
      <button ref={triggerRef} type="button" className="arcade-panel__trigger" aria-label="Open reservation information" data-contract-action="open-reservations" data-touch-target="44" onClick={open}>
        RSV
      </button>
      {unsupported ? <span role="status">Reservation information cannot open in this browser.</span> : null}
      {/* Native dialog backdrops dispatch their pointer click to the dialog itself. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={dialogRef}
        className="arcade-dialog"
        data-contract-dialog="reservations"
        aria-labelledby={`arcade-reservation-${id}`}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event: ReactMouseEvent<HTMLDialogElement>) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <section className="arcade-dialog__surface">
          <header>
            <span className="arcade-key">LEDGER</span>
            <h2 id={`arcade-reservation-${id}`}>Reservation information</h2>
            <button type="button" aria-label="Close reservation information" data-contract-action="close-reservations" data-touch-target="44" onClick={close}>×</button>
          </header>
          {reservations.length === 0 ? <p>No reservation information.</p> : (
            <ul>
              {reservations.map((reservation) => {
                const bookingUrl = safeHttpsUrl(reservation.booking.url);
                const isRevealed = revealed.has(reservation.id);
                return (
                  <li key={reservation.id} data-booking-status={reservation.booking.status}>
                    <strong>{reservation.title}</strong>
                    <span>{bookingStatusLabel(reservation.booking.status)}</span>
                    {reservation.booking.arrivalBufferMinutes === undefined ? null : <span>Arrive {reservation.booking.arrivalBufferMinutes} min early</span>}
                    {reservation.booking.reference === undefined ? null : isRevealed ? (
                      <code data-contract-owner="reservation-reference" data-owner-id={reservation.id} data-state="revealed">{reservation.booking.reference}</code>
                    ) : (
                      <button type="button" aria-label={`Show ${reservation.title} reservation code`} data-contract-action="reveal-reservation" data-owner-id={reservation.id} data-touch-target="44" onClick={() => setRevealed((current) => new Set([...current, reservation.id]))}>Show reservation code</button>
                    )}
                    {bookingUrl === undefined ? null : <a href={bookingUrl} target="_blank" rel="noreferrer noopener" aria-label={`Open ${reservation.title} reservation page`} data-touch-target="44">Open reservation page</a>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </dialog>
    </section>
  );
}

export function ArcadeTaskPanel({
  dayTitle,
  tasks,
  completedIds,
  onCompletedChange,
}: {
  dayTitle: string;
  tasks: readonly TripTask[];
  completedIds: ReadonlySet<string>;
  onCompletedChange: (id: string, completed: boolean) => void;
}) {
  const id = useId().replaceAll(":", "");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    const dialog = dialogRef.current;
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  const close = (): void => {
    if (dialogRef.current?.open) dialogRef.current.close();
    triggerRef.current?.focus();
  };

  const open = (): void => {
    const dialog = dialogRef.current;
    if (dialog === null || dialog.open) return;
    if (typeof dialog.showModal !== "function") {
      setUnsupported(true);
      return;
    }
    try {
      dialog.showModal();
      setUnsupported(false);
    } catch {
      setUnsupported(true);
    }
  };

  return (
    <section className="arcade-panel arcade-utility" data-surface="day-tasks" data-contract-surface="day-tasks" data-contract-state="task">
      <button ref={triggerRef} type="button" className="arcade-panel__trigger" aria-label={`Open tasks for ${dayTitle}`} data-contract-action="open-tasks" data-touch-target="44" onClick={open}>TSK</button>
      {unsupported ? <span role="status">Day tasks cannot open in this browser.</span> : null}
      {/* Native dialog backdrops dispatch their pointer click to the dialog itself. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={dialogRef}
        className="arcade-dialog"
        data-contract-dialog="tasks"
        aria-labelledby={`arcade-task-${id}`}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event: ReactMouseEvent<HTMLDialogElement>) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <section className="arcade-dialog__surface">
          <header>
            <span className="arcade-key">TASKS</span>
            <h2 id={`arcade-task-${id}`}>Tasks for {dayTitle}</h2>
            <button type="button" aria-label="Close day tasks" data-contract-action="close-tasks" data-touch-target="44" onClick={close}>×</button>
          </header>
          <ul className="arcade-task-list">
            {tasks.length === 0 ? <li>No tasks for this mission.</li> : tasks.map((task, taskIndex) => {
              const taskKey = taskCompletionKey(task.id);
              const children = task.children ?? [];
              const canDisclose = children.length >= 2;
              const expanded = expandedIds.has(task.id);
              const childrenId = `arcade-task-children-${id}-${taskIndex}`;
              return (
                <li key={task.id}>
                  <div className="arcade-dialog__task-row">
                    <label>
                      <input type="checkbox" data-contract-owner="task" data-owner-id={taskKey} checked={completedIds.has(taskKey)} onChange={(event) => onCompletedChange(taskKey, event.currentTarget.checked)} />
                      <span>{task.title}</span>
                    </label>
                    {canDisclose ? (
                      <button type="button" aria-label={`${expanded ? "Hide" : "Show"} ${task.title} subtasks`} aria-controls={childrenId} aria-expanded={expanded} data-touch-target="44" onClick={() => setExpandedIds((current) => {
                        const next = new Set(current);
                        if (next.has(task.id)) next.delete(task.id);
                        else next.add(task.id);
                        return next;
                      })}>{expanded ? "−" : "+"}</button>
                    ) : null}
                  </div>
                  {task.note === undefined ? null : <p>{task.note}</p>}
                  {children.length === 0 ? null : (
                    <ul id={childrenId} hidden={canDisclose && !expanded}>
                      {children.map((child) => {
                        const childKey = checklistCompletionKey(child.id);
                        return <li key={child.id}><label><input type="checkbox" checked={completedIds.has(childKey)} onChange={(event) => onCompletedChange(childKey, event.currentTarget.checked)} /><span>{child.title}</span></label></li>;
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </dialog>
    </section>
  );
}
