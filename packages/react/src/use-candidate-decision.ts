import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefCallback,
} from "react";

import {
  candidateMapOverrideFor,
  candidateSessionReducer,
  initialCandidateDraftId,
  isValidCandidatePreviewRequest,
  type CandidateGroup,
  type CandidateMapOverride,
  type CandidatePreviewRequest,
  type CandidateSessionState,
} from "@laugh-tale/core";

export interface UseCandidateDecisionOptions {
  group: CandidateGroup;
  /**
   * The group carried by emitted map overrides. Defaults to `group`; a
   * consumer that renders decorated option titles passes the decorated
   * group here so the map matches the list.
   */
  overrideGroup?: CandidateGroup;
  committedOptionId?: string;
  /** A map-originated request to preview one option in the list. */
  mapPreviewRequest?: CandidatePreviewRequest;
  onMapOverrideChange: (override: CandidateMapOverride | null) => void;
  /** Called with the confirmed option id before the comparison closes. */
  onConfirm: (optionId: string) => void;
}

export interface CandidateTriggerProps {
  ref: RefCallback<HTMLElement>;
  onClick: () => void;
  "aria-expanded": boolean;
}

export interface CandidateDecisionController {
  open: boolean;
  sessionId: number | null;
  draftOptionId: string | undefined;
  openComparison: () => void;
  /** Cancels: closes, resets the draft from committed, restores trigger focus. */
  closeComparison: () => void;
  /** Single-mode: confirms the draft via `onConfirm`, closes, restores trigger focus. */
  confirmDraft: () => void;
  /** Single-mode draft preview from the list. */
  previewOption: (optionId: string) => void;
  getTriggerProps: () => CandidateTriggerProps;
  /** Registers an option element for map-initiated preview focus. */
  registerOption: (optionId: string) => RefCallback<HTMLElement>;
}

let candidateSessionSequence = 0;

function nextCandidateSessionId(): number {
  candidateSessionSequence += 1;
  return candidateSessionSequence;
}

/**
 * Candidate comparison ownership: committed choice stays with the caller's
 * progress store, draft preview and the comparison session live here, and
 * map overrides always carry the live session id so stale map interactions
 * cannot mutate a later session. Focus returns to the trigger when the
 * comparison closes.
 */
export function useCandidateDecision(
  options: UseCandidateDecisionOptions,
): CandidateDecisionController {
  const {
    group,
    overrideGroup = group,
    committedOptionId,
    mapPreviewRequest,
    onMapOverrideChange,
    onConfirm,
  } = options;
  const triggerRef = useRef<HTMLElement | null>(null);
  const optionRefs = useRef(new Map<string, HTMLElement>());
  const lastFocusedPreviewKeyRef = useRef<string | null>(null);
  const [state, setState] = useState<CandidateSessionState>(() => ({
    sessionId: null,
    draftOptionId: initialCandidateDraftId(group, committedOptionId),
  }));
  const [handledPreviewKey, setHandledPreviewKey] = useState<string | null>(null);

  const open = state.sessionId !== null;
  const hasValidPreviewRequest = isValidCandidatePreviewRequest(
    group,
    state.sessionId,
    mapPreviewRequest,
  );
  const requestedPreviewKey =
    hasValidPreviewRequest && mapPreviewRequest !== undefined
      ? `${state.sessionId}:${mapPreviewRequest.requestId}`
      : null;

  if (requestedPreviewKey !== null && requestedPreviewKey !== handledPreviewKey) {
    setHandledPreviewKey(requestedPreviewKey);
    if (
      mapPreviewRequest !== undefined &&
      group.mode === "single" &&
      mapPreviewRequest.optionId !== state.draftOptionId
    ) {
      setState((current) =>
        candidateSessionReducer(group, current, {
          type: "preview",
          optionId: mapPreviewRequest.optionId,
        }),
      );
    }
  }

  useEffect(() => {
    onMapOverrideChange(candidateMapOverrideFor(overrideGroup, state));
  }, [onMapOverrideChange, overrideGroup, state]);

  useEffect(
    () => () => {
      onMapOverrideChange(null);
    },
    [onMapOverrideChange],
  );

  const requestedOptionId = mapPreviewRequest?.optionId;
  useEffect(() => {
    if (
      requestedPreviewKey === null ||
      requestedPreviewKey !== handledPreviewKey ||
      requestedPreviewKey === lastFocusedPreviewKeyRef.current ||
      requestedOptionId === undefined
    ) {
      return;
    }
    lastFocusedPreviewKeyRef.current = requestedPreviewKey;
    const optionControl = optionRefs.current.get(requestedOptionId);
    optionControl?.scrollIntoView?.({ block: "nearest" });
    optionControl?.focus();
  }, [handledPreviewKey, requestedOptionId, requestedPreviewKey]);

  const restoreTriggerFocus = useCallback((): void => {
    queueMicrotask(() => triggerRef.current?.focus());
  }, []);

  const openComparison = useCallback((): void => {
    setState((current) =>
      candidateSessionReducer(group, current, {
        type: "open",
        sessionId: nextCandidateSessionId(),
        ...(committedOptionId === undefined ? {} : { committedOptionId }),
      }),
    );
  }, [committedOptionId, group]);

  const closeComparison = useCallback((): void => {
    setState((current) =>
      candidateSessionReducer(group, current, {
        type: "close",
        ...(committedOptionId === undefined ? {} : { committedOptionId }),
      }),
    );
    restoreTriggerFocus();
  }, [committedOptionId, group, restoreTriggerFocus]);

  const draftOptionId = state.draftOptionId;
  const confirmDraft = useCallback((): void => {
    if (group.mode !== "single" || draftOptionId === undefined) {
      return;
    }
    const option = group.options.find(({ id }) => id === draftOptionId);
    if (option === undefined) {
      return;
    }
    onConfirm(option.id);
    setState((current) =>
      candidateSessionReducer(group, current, {
        type: "close",
        committedOptionId: option.id,
      }),
    );
    restoreTriggerFocus();
  }, [draftOptionId, group, onConfirm, restoreTriggerFocus]);

  const previewOption = useCallback(
    (optionId: string): void => {
      setState((current) =>
        candidateSessionReducer(group, current, { type: "preview", optionId }),
      );
    },
    [group],
  );

  const setTrigger = useCallback<RefCallback<HTMLElement>>((element) => {
    triggerRef.current = element;
  }, []);

  const getTriggerProps = useCallback(
    (): CandidateTriggerProps => ({
      ref: setTrigger,
      onClick: open ? closeComparison : openComparison,
      "aria-expanded": open,
    }),
    [closeComparison, open, openComparison, setTrigger],
  );

  const registerOption = useCallback(
    (optionId: string): RefCallback<HTMLElement> =>
      (element) => {
        if (element === null) {
          optionRefs.current.delete(optionId);
        } else {
          optionRefs.current.set(optionId, element);
        }
      },
    [],
  );

  return {
    open,
    sessionId: state.sessionId,
    draftOptionId: state.draftOptionId,
    openComparison,
    closeComparison,
    confirmDraft,
    previewOption,
    getTriggerProps,
    registerOption,
  };
}
