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
    ? "已確認"
    : status === "pending"
      ? "待確認"
      : "尚未訂位";
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
    <section className="atlas-utility" data-surface="reservations">
      <button
        ref={triggerRef}
        type="button"
        className="atlas-utility__trigger"
        aria-label="開啟訂位資訊"
        data-touch-target="44"
        onClick={open}
      >
        <span aria-hidden="true">RSV</span>
      </button>
      {unsupported ? <span role="status">此瀏覽器無法開啟訂位資訊。</span> : null}
      {/* Native dialog backdrops dispatch their pointer click to the dialog itself. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={dialogRef}
        className="atlas-dialog"
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
            <h2 id={`atlas-reservation-${id}`}>訂位資訊</h2>
            <button type="button" aria-label="關閉訂位資訊" data-touch-target="44" onClick={close}>×</button>
          </header>
          {reservations.length === 0 ? (
            <p>目前沒有訂位資訊</p>
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
                      <span>提前 {reservation.booking.arrivalBufferMinutes} 分鐘抵達</span>
                    )}
                    {reservation.booking.reference === undefined ? null : isRevealed ? (
                      <code>{reservation.booking.reference}</code>
                    ) : (
                      <button
                        type="button"
                        aria-label={`顯示 ${reservation.title} 訂位代碼`}
                        data-touch-target="44"
                        onClick={() => setRevealed((current) => new Set([...current, reservation.id]))}
                      >
                        顯示訂位代碼
                      </button>
                    )}
                    {bookingUrl === undefined ? null : (
                      <a
                        href={bookingUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={`開啟 ${reservation.title} 訂位頁面`}
                        data-touch-target="44"
                      >
                        開啟訂位頁面
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
    <section className="atlas-utility" data-surface="day-tasks">
      <button
        ref={triggerRef}
        type="button"
        className="atlas-utility__trigger"
        aria-label={`開啟 ${dayTitle} 當日事項`}
        data-touch-target="44"
        onClick={open}
      >
        <span aria-hidden="true">TSK</span>
      </button>
      {unsupported ? <span role="status">此瀏覽器無法開啟當日事項。</span> : null}
      {/* Native dialog backdrops dispatch their pointer click to the dialog itself. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={dialogRef}
        className="atlas-dialog"
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
            <h2 id={`atlas-task-${id}`}>{dayTitle} 當日事項</h2>
            <button type="button" aria-label="關閉當日事項" data-touch-target="44" onClick={close}>×</button>
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
                        aria-label={`${expanded ? "隱藏" : "顯示"} ${task.title} 子項`}
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
