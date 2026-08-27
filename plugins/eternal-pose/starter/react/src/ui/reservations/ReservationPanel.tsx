import { Eye, TicketCheck, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import type { Booking, Reservation } from "@laugh-tale/core";

export interface ReservationPanelProps {
  reservations: readonly Reservation[];
}

function bookingStatusLabel(status: Booking["status"]): string {
  return status === "confirmed"
    ? "已確認"
    : status === "pending"
      ? "待確認"
      : "尚未訂位";
}

function safeHttpsUrl(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function ReservationPanel({ reservations }: ReservationPanelProps) {
  const generatedId = useId().replaceAll(":", "");
  const titleId = `reservation-dialog-title-${generatedId}`;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [modalUnavailable, setModalUnavailable] = useState(false);
  const [revealedIds, setRevealedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    return () => {
      if (dialog?.open && typeof dialog.close === "function") {
        dialog.close();
      }
    };
  }, []);

  const openDialog = (): void => {
    const dialog = dialogRef.current;
    if (dialog === null || dialog.open) {
      return;
    }
    if (typeof dialog.showModal !== "function") {
      setModalUnavailable(true);
      return;
    }
    try {
      dialog.showModal();
      setModalUnavailable(false);
    } catch {
      setModalUnavailable(true);
    }
  };

  const closeDialog = (): void => {
    const dialog = dialogRef.current;
    if (dialog?.open && typeof dialog.close === "function") {
      dialog.close();
    }
    setRevealedIds(new Set());
    triggerRef.current?.focus();
  };

  const handleBackdrop = (event: ReactMouseEvent<HTMLDialogElement>): void => {
    if (event.target === event.currentTarget) {
      closeDialog();
    }
  };

  const reveal = (reservationId: string): void => {
    setRevealedIds((current) => {
      if (current.has(reservationId)) {
        return current;
      }
      return new Set([...current, reservationId]);
    });
  };

  return (
    <section className="reservation-panel" data-surface="reservations">
      <button
        ref={triggerRef}
        type="button"
        className="reservation-panel__trigger icon-control"
        aria-label="開啟訂位資訊"
        data-touch-target="44"
        onClick={openDialog}
      >
        <TicketCheck aria-hidden="true" size={19} strokeWidth={1.8} />
      </button>

      {modalUnavailable ? (
        <span
          className="reservation-panel__unsupported"
          role="status"
          aria-label="無法開啟訂位資訊"
        >
          此瀏覽器無法開啟訂位資訊。
        </span>
      ) : null}

      {/* Native dialog backdrops dispatch their pointer click to the dialog itself. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={dialogRef}
        className="reservation-panel__dialog"
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClick={handleBackdrop}
      >
        <section className="reservation-panel__dialog-surface">
          <header className="reservation-panel__dialog-header">
            <h2 id={titleId}>訂位資訊</h2>
            <button
              type="button"
              className="icon-control"
              aria-label="關閉訂位資訊"
              data-touch-target="44"
              onClick={closeDialog}
            >
              <X aria-hidden="true" size={19} strokeWidth={1.8} />
            </button>
          </header>

          {reservations.length === 0 ? (
            <p className="reservation-panel__empty">目前沒有訂位資訊</p>
          ) : (
            <ul className="reservation-panel__list">
              {reservations.map((reservation) => {
                const reference = reservation.booking.reference;
                const revealed = revealedIds.has(reservation.id);
                const bookingUrl = safeHttpsUrl(reservation.booking.url);
                return (
                  <li
                    key={`reservation:${reservation.id}`}
                    className="reservation-panel__item"
                    data-booking-status={reservation.booking.status}
                  >
                    <strong>{reservation.title}</strong>
                    <span>{bookingStatusLabel(reservation.booking.status)}</span>
                    {reservation.booking.arrivalBufferMinutes === undefined ? null : (
                      <span>提前 {reservation.booking.arrivalBufferMinutes} 分鐘抵達</span>
                    )}
                    {reference === undefined ? null : revealed ? (
                      <code className="reservation-panel__reference">{reference}</code>
                    ) : (
                      <button
                        type="button"
                        className="reservation-panel__reveal"
                        aria-label={`顯示 ${reservation.title} 訂位代碼`}
                        data-touch-target="44"
                        onClick={() => reveal(reservation.id)}
                      >
                        <Eye aria-hidden="true" size={17} strokeWidth={1.8} />
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
