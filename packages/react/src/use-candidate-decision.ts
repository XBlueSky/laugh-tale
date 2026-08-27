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
} from "@laugh-tale-island/core";

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

interface StoredCandidateState {
  groupId: string | null;
  session: CandidateSessionState;
}

let candidateSessionSequence = 0;

function nextCandidateSessionId(): number {
  candidateSessionSequence += 1;
  return candidateSessionSequence;
}

function stateFor(
  options: UseCandidateDecisionOptions | null,
): StoredCandidateState {
  return options === null
    ? {
        groupId: null,
        session: { sessionId: null, draftOptionId: undefined },
      }
    : {
        groupId: options.group.id,
        session: {
          sessionId: null,
          draftOptionId: initialCandidateDraftId(
            options.group,
            options.committedOptionId,
          ),
        },
      };
}

/**
 * Optional candidate comparison ownership. All hooks remain mounted while a
 * selected node gains, changes, or loses a candidate group. Group changes
 * start closed from the new committed option and invalidate prior sessions,
 * preview requests, focus targets, and map overrides.
 */
export function useOptionalCandidateDecision(
  options: UseCandidateDecisionOptions | null,
): CandidateDecisionController | null {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const activeGroupIdRef = useRef(options?.group.id ?? null);
  activeGroupIdRef.current = options?.group.id ?? null;
  const lastOptionsRef = useRef<UseCandidateDecisionOptions | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const optionRefs = useRef(new Map<string, HTMLElement>());
  const handledPreviewKeyRef = useRef<string | null>(null);
  const lastFocusedPreviewKeyRef = useRef<string | null>(null);
  const [stored, setStored] = useState<StoredCandidateState>(() =>
    stateFor(options),
  );
  const storedRef = useRef(stored);
  storedRef.current = stored;

  const nextGroupId = options?.group.id ?? null;
  if (stored.groupId !== nextGroupId) {
    triggerRef.current = null;
    optionRefs.current.clear();
    handledPreviewKeyRef.current = null;
    lastFocusedPreviewKeyRef.current = null;
    setStored(stateFor(options));
  }

  const state = stored.session;
  const group = options?.group;
  const mapPreviewRequest = options?.mapPreviewRequest;
  const hasValidPreviewRequest =
    group !== undefined &&
    isValidCandidatePreviewRequest(
      group,
      state.sessionId,
      mapPreviewRequest,
    );
  const requestedPreviewKey =
    hasValidPreviewRequest && mapPreviewRequest !== undefined
      ? `${state.sessionId}:${mapPreviewRequest.requestId}`
      : null;

  useEffect(() => {
    const previous = lastOptionsRef.current;
    if (
      previous !== null &&
      (options === null || previous.group.id !== options.group.id)
    ) {
      previous.onMapOverrideChange(null);
    }
    lastOptionsRef.current = options;
    if (options !== null) {
      options.onMapOverrideChange(
        candidateMapOverrideFor(
          options.overrideGroup ?? options.group,
          state,
        ),
      );
    }
  }, [options, state]);

  useEffect(
    () => () => {
      lastOptionsRef.current?.onMapOverrideChange(null);
      lastOptionsRef.current = null;
      optionRefs.current.clear();
      triggerRef.current = null;
      handledPreviewKeyRef.current = null;
      lastFocusedPreviewKeyRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (
      options === null ||
      requestedPreviewKey === null ||
      requestedPreviewKey === handledPreviewKeyRef.current ||
      mapPreviewRequest === undefined
    ) {
      return;
    }
    handledPreviewKeyRef.current = requestedPreviewKey;
    if (
      options.group.mode === "single" &&
      mapPreviewRequest.optionId !== state.draftOptionId
    ) {
      setStored((current) => ({
        ...current,
        session: candidateSessionReducer(options.group, current.session, {
          type: "preview",
          optionId: mapPreviewRequest.optionId,
        }),
      }));
    }
    if (lastFocusedPreviewKeyRef.current !== requestedPreviewKey) {
      lastFocusedPreviewKeyRef.current = requestedPreviewKey;
      const optionControl = optionRefs.current.get(mapPreviewRequest.optionId);
      optionControl?.scrollIntoView?.({ block: "nearest" });
      optionControl?.focus();
    }
  }, [mapPreviewRequest, options, requestedPreviewKey, state.draftOptionId]);

  const restoreTriggerFocus = useCallback((groupId: string): void => {
    queueMicrotask(() => {
      if (activeGroupIdRef.current === groupId) {
        triggerRef.current?.focus();
      }
    });
  }, []);

  const openComparison = useCallback((): void => {
    const currentOptions = optionsRef.current;
    if (currentOptions === null) return;
    setStored((current) => ({
      ...current,
      session: candidateSessionReducer(
        currentOptions.group,
        current.session,
        {
          type: "open",
          sessionId: nextCandidateSessionId(),
          ...(currentOptions.committedOptionId === undefined
            ? {}
            : { committedOptionId: currentOptions.committedOptionId }),
        },
      ),
    }));
  }, []);

  const closeComparison = useCallback((): void => {
    const currentOptions = optionsRef.current;
    if (currentOptions === null) return;
    setStored((current) => ({
      ...current,
      session: candidateSessionReducer(
        currentOptions.group,
        current.session,
        {
          type: "close",
          ...(currentOptions.committedOptionId === undefined
            ? {}
            : { committedOptionId: currentOptions.committedOptionId }),
        },
      ),
    }));
    restoreTriggerFocus(currentOptions.group.id);
  }, [restoreTriggerFocus]);

  const confirmDraft = useCallback((): void => {
    const currentOptions = optionsRef.current;
    if (currentOptions === null || currentOptions.group.mode !== "single") {
      return;
    }
    const current = storedRef.current;
    const option = currentOptions.group.options.find(
      ({ id }) => id === current.session.draftOptionId,
    );
    if (option === undefined) return;
    currentOptions.onConfirm(option.id);
    restoreTriggerFocus(currentOptions.group.id);
    setStored({
      ...current,
      session: candidateSessionReducer(
        currentOptions.group,
        current.session,
        {
          type: "close",
          committedOptionId: option.id,
        },
      ),
    });
  }, [restoreTriggerFocus]);

  const previewOption = useCallback((optionId: string): void => {
    const currentOptions = optionsRef.current;
    if (currentOptions === null) return;
    setStored((current) => ({
      ...current,
      session: candidateSessionReducer(
        currentOptions.group,
        current.session,
        { type: "preview", optionId },
      ),
    }));
  }, []);

  const setTrigger = useCallback<RefCallback<HTMLElement>>((element) => {
    triggerRef.current = element;
  }, []);

  const open = options !== null && state.sessionId !== null;
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
        if (element === null) optionRefs.current.delete(optionId);
        else optionRefs.current.set(optionId, element);
      },
    [],
  );

  if (options === null) return null;
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
  const decision = useOptionalCandidateDecision(options);
  if (decision === null) {
    throw new Error("Candidate decision options are required.");
  }
  return decision;
}
