import type { CandidateDecisionModel } from "@laugh-tale-island/react";
import { useCallback, useLayoutEffect, useRef } from "react";
import { catalog } from "../copy/catalog.js";
import type { TimelineContext } from "../timeline/ItineraryTimeline.js";

export function CandidateDecision({ decision, actions, bindings }: Pick<TimelineContext, "actions" | "bindings"> & { decision: CandidateDecisionModel }) {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(decision.open);
  const registerDialog = bindings.focus.dialogRef(decision.groupId);
  const registerTrigger = bindings.focus.disclosureTriggerRef(decision.groupId);
  const dialogRef = useCallback((element: HTMLDialogElement | null) => {
    dialog.current = element;
    registerDialog(element);
  }, [registerDialog]);
  const triggerRef = useCallback((element: HTMLButtonElement | null) => {
    trigger.current = element;
    registerTrigger(element);
  }, [registerTrigger]);
  useLayoutEffect(() => {
    const justClosed = wasOpen.current && !decision.open;
    wasOpen.current = decision.open;
    const element = trigger.current;
    if (!justClosed || !element) return;
    // The shared focus registry restores focus without scrolling. Reveal the
    // trigger inside the sheet before that restoration; never move the page/map.
    const sheet = element.closest(".oak-itinerary-sheet");
    if (!sheet) return;
    for (let port = element.parentElement; port && port !== sheet; port = port.parentElement) {
      if (!/^(auto|scroll)$/.test(getComputedStyle(port).overflowY) || port.scrollHeight <= port.clientHeight) continue;
      const target = element.getBoundingClientRect();
      const frame = port.getBoundingClientRect();
      const top = frame.top + port.clientTop;
      const bottom = top + port.clientHeight;
      const inset = Math.min(4, Math.max(0, (port.clientHeight - target.height) / 2));
      const delta = target.top < top + inset ? target.top - top - inset : target.bottom > bottom - inset ? target.bottom - bottom + inset : 0;
      if (Math.abs(delta) > 0.25) port.scrollTo({ top: port.scrollTop + delta, behavior: "instant" });
    }
  }, [decision.open]);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!decision.open || !element) return;
    element.focus({ preventScroll: true });
    // Align within the sheet only: document scrolling would move the map/header.
    const sheet = element.closest(".oak-itinerary-sheet");
    const heading = element.querySelector("h4");
    if (!sheet || !heading) return;
    for (let port = element.parentElement; port && port !== sheet; port = port.parentElement) {
      if (!/^(auto|scroll)$/.test(getComputedStyle(port).overflowY) || port.scrollHeight <= port.clientHeight) continue;
      // Round toward a small inset so fractional layout cannot clip the heading.
      port.scrollTo({ top: Math.floor(port.scrollTop + heading.getBoundingClientRect().top - port.getBoundingClientRect().top - port.clientTop - 1), behavior: "instant" });
      break;
    }
  }, [decision.open, decision.sessionId]);
  return <section className="oak-candidate-decision" data-candidate-owner={decision.parentOwnerId}>
    {decision.capabilities.reopen && <button type="button" className="oak-control" ref={triggerRef} onClick={() => actions.reopenCandidate(decision.groupId)}>{catalog.candidate.reopen}</button>}
    {decision.open && <dialog open className="oak-candidate-dialog" tabIndex={-1} aria-label={catalog.accessibleNames.candidateDialog} ref={dialogRef} onCancel={event => { event.preventDefault(); if (decision.capabilities.cancel) actions.cancelCandidate(decision.groupId); }} onKeyDown={event => { if (event.key === "Escape" && decision.capabilities.cancel) { event.preventDefault(); event.stopPropagation(); actions.cancelCandidate(decision.groupId); } }}>
      <h4>{catalog.candidate.title}</h4><p>{catalog.candidate[decision.mode]}</p>
      <ol>{decision.options.map(option => {
        const content = <><span className="oak-candidate-ordinal">{option.ordinal}</span><span className="oak-candidate-copy"><span className="oak-candidate-title">{option.title}</span>{option.place && <span className="oak-candidate-fact">{option.place.label.trim() === option.title.trim() ? "" : `${option.place.label} · `}{catalog.certainty[option.place.certainty]}{option.place.resolution.status === "unresolved" && ` · ${catalog.facts.unverifiedLocation}`}</span>}{option.booking && <span className="oak-candidate-fact">{catalog.booking[option.booking.status]}{option.booking.reference && ` · ${catalog.booking.reference}: ${option.booking.reference}`}</span>}{(option.selected || option.draft) && <span className="oak-candidate-status">{option.selected && <span>{catalog.candidate.selected}</span>}{option.draft && <span>{catalog.candidate.draft}</span>}</span>}</span></>;
        return <li key={option.id} data-candidate-id={option.id} data-draft={option.draft} data-selected={option.selected}>
          {decision.capabilities.previewOptionIds.includes(option.id) ? <button type="button" className="oak-candidate-option" ref={bindings.focus.dialogRef(option.id)} aria-label={`${catalog.candidate.preview} · ${option.ordinal} · ${option.title}`} aria-pressed={option.draft} onClick={() => actions.previewCandidate(decision.groupId, option.id)}>{content}</button> : <div className="oak-candidate-option" ref={bindings.focus.dialogRef(option.id)} tabIndex={-1}>{content}</div>}
        </li>;
      })}</ol>
      <div className="oak-detail-actions">
        {decision.capabilities.cancel && <button type="button" className="oak-control" onClick={() => actions.cancelCandidate(decision.groupId)}>{catalog.candidate.cancel}</button>}
        {decision.capabilities.confirm && <button type="button" className="oak-control" onClick={() => actions.confirmCandidate(decision.groupId)}>{catalog.candidate.confirm}</button>}
      </div>
    </dialog>}
  </section>;
}
