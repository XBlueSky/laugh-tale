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
  type Reservation,
  type TripTask,
} from "@laugh-tale-island/core";

function bookingStatusLabel(status: Booking["status"]): string {
  return status === "confirmed"
    ? "Confirmed"
    : status === "pending"
      ? "Pending"
      : "Not booked";
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

export function AtlasReservationPanel({
  reservations,
}: {
  reservations: readonly Reservation[];
}) {
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
    <section
      className="atlas-utility"
      data-surface="reservations"
      data-contract-surface="reservations"
    >
      <button
        ref={triggerRef}
        type="button"
        className="atlas-utility__trigger"
        aria-label="Open reservation information"
        data-contract-action="open-reservations"
        data-touch-target="44"
        onClick={open}
      >
        <span aria-hidden="true">RSV</span>
      </button>
      {unsupported ? <span role="status">Reservation information cannot open in this browser.</span> : null}
      {/* Native dialog backdrops dispatch their pointer click to the dialog itself. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={dialogRef}
        className="atlas-dialog"
        data-contract-dialog="reservations"
        aria-labelledby={`atlas-reservation-${id}`}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event: ReactMouseEvent<HTMLDialogElement>) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <section className="atlas-dialog__surface">
          <header>
            <span className="atlas-key">LEDGER</span>
            <h2 id={`atlas-reservation-${id}`}>Reservation information</h2>
            <button
              type="button"
              aria-label="Close reservation information"
              data-contract-action="close-reservations"
              data-touch-target="44"
              onClick={close}
            >×</button>
          </header>
          {reservations.length === 0 ? (
            <p>No reservation information.</p>
          ) : (
            <ul>
              {reservations.map((reservation) => {
                const bookingUrl = safeHttpsUrl(reservation.booking.url);
                const isRevealed = revealed.has(reservation.id);
                return (
                  <li key={reservation.id} data-booking-status={reservation.booking.status}>
                    <strong>{reservation.title}</strong>
                    <span>{bookingStatusLabel(reservation.booking.status)}</span>
                    {reservation.booking.arrivalBufferMinutes === undefined ? null : (
                      <span>Arrive {reservation.booking.arrivalBufferMinutes} min early</span>
                    )}
                    {reservation.booking.reference === undefined ? null : isRevealed ? (
                      <code
                        data-contract-owner="reservation-reference"
                        data-owner-id={reservation.id}
                        data-state="revealed"
                      >
                        {reservation.booking.reference}
                      </code>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Show ${reservation.title} reservation code`}
                        data-contract-action="reveal-reservation"
                        data-owner-id={reservation.id}
                        data-touch-target="44"
                        onClick={() => setRevealed((current) => new Set([...current, reservation.id]))}
                      >
                        Show reservation code
                      </button>
                    )}
                    {bookingUrl === undefined ? null : (
                      <a
                        href={bookingUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={`Open ${reservation.title} reservation page`}
                        data-touch-target="44"
                      >
                        Open reservation page
                      </a>
                    )}
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

export function AtlasTaskPanel({
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
    <section
      className="atlas-utility"
      data-surface="day-tasks"
      data-contract-surface="day-tasks"
    >
      <button
        ref={triggerRef}
        type="button"
        className="atlas-utility__trigger"
        aria-label={`Open tasks for ${dayTitle}`}
        data-contract-action="open-tasks"
        data-touch-target="44"
        onClick={open}
      >
        <span aria-hidden="true">TSK</span>
      </button>
      {unsupported ? <span role="status">Day tasks cannot open in this browser.</span> : null}
      {/* Native dialog backdrops dispatch their pointer click to the dialog itself. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={dialogRef}
        className="atlas-dialog"
        data-contract-dialog="tasks"
        aria-labelledby={`atlas-task-${id}`}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event: ReactMouseEvent<HTMLDialogElement>) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <section className="atlas-dialog__surface">
          <header>
            <span className="atlas-key">TASKS</span>
            <h2 id={`atlas-task-${id}`}>Tasks for {dayTitle}</h2>
            <button
              type="button"
              aria-label="Close day tasks"
              data-contract-action="close-tasks"
              data-touch-target="44"
              onClick={close}
            >×</button>
          </header>
          <ul>
            {tasks.map((task, taskIndex) => {
              const taskKey = taskCompletionKey(task.id);
              const children = task.children ?? [];
              const canDisclose = children.length >= 2;
              const expanded = expandedIds.has(task.id);
              const childrenId = `atlas-task-children-${id}-${taskIndex}`;
              return (
                <li key={task.id}>
                  <div className="atlas-dialog__task-row">
                    <label>
                      <input
                        type="checkbox"
                        data-contract-owner="task"
                        data-owner-id={taskKey}
                        checked={completedIds.has(taskKey)}
                        onChange={(event) =>
                          onCompletedChange(taskKey, event.currentTarget.checked)
                        }
                      />
                      <span>{task.title}</span>
                    </label>
                    {canDisclose ? (
                      <button
                        type="button"
                        aria-label={`${expanded ? "Hide" : "Show"} ${task.title} subtasks`}
                        aria-controls={childrenId}
                        aria-expanded={expanded}
                        data-touch-target="44"
                        onClick={() => setExpandedIds((current) => {
                          const next = new Set(current);
                          if (next.has(task.id)) next.delete(task.id);
                          else next.add(task.id);
                          return next;
                        })}
                      >
                        {expanded ? "−" : "+"}
                      </button>
                    ) : null}
                  </div>
                  {task.note === undefined ? null : <p>{task.note}</p>}
                  {children.length === 0 ? null : (
                    <ul id={childrenId} hidden={canDisclose && !expanded}>
                      {children.map((child) => {
                        const childKey = checklistCompletionKey(child.id);
                        return (
                          <li key={child.id}>
                            <label>
                              <input
                                type="checkbox"
                                checked={completedIds.has(childKey)}
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
        </section>
      </dialog>
    </section>
  );
}
