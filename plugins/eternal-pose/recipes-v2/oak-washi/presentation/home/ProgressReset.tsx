import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { HomeViewProps } from "@laugh-tale-island/react";
import { ChevronDown } from "lucide-react";
import { catalog } from "../copy/catalog.js";

export function ProgressReset({ model, actions }: HomeViewProps) {
  const copy = catalog.persistence;
  const [dayId, setDayId] = useState(model.effectiveEntryDayId);
  const [pending, setPending] = useState<{ scope: "trip" | "day"; dayId: string; label: string } | null>(null);
  const [feedback, setFeedback] = useState("");
  const trigger = useRef<HTMLButtonElement | null>(null);
  const cancel = useRef<HTMLButtonElement | null>(null);
  useLayoutEffect(() => { if (pending) cancel.current?.focus(); }, [pending]);
  const id = useId();
  const allowed = model.capabilities.progress;
  const days = model.days.filter(day => allowed.resetDayIds.includes(day.id));
  const selected = days.find(day => day.id === dayId) ?? days[0];
  if (!allowed.resetTrip && days.length === 0) return null;
  const close = () => { setPending(null); trigger.current?.focus(); };
  const escape = (event: KeyboardEvent<HTMLButtonElement>) => { if (event.key === "Escape") { event.preventDefault(); close(); } };
  const request = (scope: "trip" | "day", button: HTMLButtonElement) => {
    trigger.current = button;
    setFeedback("");
    setPending({ scope, dayId: selected?.id ?? "", label: scope === "trip" ? model.identity.title : `${selected?.date ?? ""} · ${selected?.title ?? ""}` });
  };
  return <details className="oak-progress-reset" onToggle={event => { if (!event.currentTarget.open) setPending(null); }}>
    <summary className="oak-control">{copy.manageProgress}</summary>
    <div className="oak-progress-reset-content">
      {selected && <label>{copy.resetDayScope}<span className="oak-native-select"><select aria-label={copy.resetDayScope} value={selected.id} onChange={event => { setDayId(event.currentTarget.value); setPending(null); setFeedback(""); }}>
        {days.map(day => <option key={day.id} value={day.id}>{day.date} · {day.title}</option>)}
      </select><ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" /></span></label>}
      <div className="oak-detail-actions">
        {selected && <button type="button" className="oak-control" onClick={event => request("day", event.currentTarget)}>{copy.resetDay}</button>}
        {allowed.resetTrip && <button type="button" className="oak-control" onClick={event => request("trip", event.currentTarget)}>{copy.resetTrip}</button>}
      </div>
      {pending && <div className="oak-reset-confirmation" role="group" aria-labelledby={id}>
        <p id={id}>{copy.confirmReset}</p>
        <p>{pending.scope === "trip" ? copy.resetTrip : copy.resetDay} · {pending.label}</p>
        <p>{copy.resetExplanation}</p>
        <div className="oak-detail-actions">
          <button type="button" className="oak-control" ref={cancel} onKeyDown={escape} onClick={close}>{copy.cancelReset}</button>
          <button type="button" className="oak-control" onKeyDown={escape} onClick={() => {
            if (pending.scope === "trip" ? allowed.resetTrip : allowed.resetDayIds.includes(pending.dayId)) {
              actions.resetProgress(pending.scope, pending.scope === "day" ? pending.dayId : undefined);
              setFeedback(copy.resetDone);
            }
            close();
          }}>{copy.confirmReset}</button>
        </div>
      </div>}
      <p role="status">{feedback}</p>
    </div>
  </details>;
}
