import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import type { CandidateGroup, CandidateOption } from "@laugh-tale/core";

export interface CandidateMapOverride {
  group: CandidateGroup;
  sessionId: number;
  activeOptionId?: string;
}

export interface CandidatePreviewRequest {
  groupId: string;
  sessionId: number;
  optionId: string;
  requestId: number;
}

export interface CandidateDecisionProps {
  group: CandidateGroup;
  label: string;
  sequenceNumber: number;
  committedOptionId?: string;
  mapPreviewRequest?: CandidatePreviewRequest;
  onMapOverrideChange: (override: CandidateMapOverride | null) => void;
  onCommit: (groupId: string, optionId: string) => void;
  onLocateOption: (optionId: string) => void;
}

function optionLetter(index: number): string {
  let remaining = index + 1;
  let output = "";
  while (remaining > 0) {
    remaining -= 1;
    output = String.fromCharCode(65 + (remaining % 26)) + output;
    remaining = Math.floor(remaining / 26);
  }
  return output;
}

export function candidateOptionLabel(
  sequenceNumber: number,
  index: number,
  option: Pick<CandidateOption, "title">,
): string {
  return `${sequenceNumber}${optionLetter(index)} · ${option.title}`;
}

function initialDraftId(
  group: CandidateGroup,
  committedOptionId: string | undefined,
): string | undefined {
  if (group.options.some(({ id }) => id === committedOptionId)) {
    return committedOptionId;
  }
  if (group.options.some(({ id }) => id === group.defaultOptionId)) {
    return group.defaultOptionId;
  }
  return group.options[0]?.id;
}

function hasCoordinates(option: CandidateOption): boolean {
  const coordinates = option.place?.coordinates;
  return (
    coordinates !== undefined &&
    Number.isFinite(coordinates.lat) &&
    coordinates.lat >= -90 &&
    coordinates.lat <= 90 &&
    Number.isFinite(coordinates.lng) &&
    coordinates.lng >= -180 &&
    coordinates.lng <= 180
  );
}

let candidateSessionSequence = 0;

function nextCandidateSessionId(): number {
  candidateSessionSequence += 1;
  return candidateSessionSequence;
}

export function CandidateDecision({
  group,
  label,
  sequenceNumber,
  committedOptionId,
  mapPreviewRequest,
  onMapOverrideChange,
  onCommit,
  onLocateOption,
}: CandidateDecisionProps) {
  const radioName = `candidate-decision-${useId().replaceAll(":", "")}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef(new Map<string, HTMLElement>());
  const lastFocusedMapPreviewRequestKeyRef = useRef<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [draftOptionId, setDraftOptionId] = useState<string | undefined>(() =>
    initialDraftId(group, committedOptionId),
  );
  const [handledMapPreviewRequestKey, setHandledMapPreviewRequestKey] =
    useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const committedOption = group.options.find(({ id }) => id === committedOptionId);
  const numberedGroup = useMemo<CandidateGroup>(
    () => ({
      ...group,
      options: group.options.map((option, index) => ({
        ...option,
        title: candidateOptionLabel(sequenceNumber, index, option),
      })),
    }),
    [group, sequenceNumber],
  );
  const requestedOptionId = mapPreviewRequest?.optionId;
  const requestedPreviewId = mapPreviewRequest?.requestId;
  const hasValidPreviewRequest =
    expanded &&
    sessionId !== null &&
    mapPreviewRequest?.groupId === group.id &&
    mapPreviewRequest.sessionId === sessionId &&
    requestedPreviewId !== undefined &&
    requestedOptionId !== undefined &&
    group.options.some(({ id }) => id === requestedOptionId);
  const requestedPreviewKey = hasValidPreviewRequest
    ? `${sessionId}:${requestedPreviewId}`
    : null;

  if (
    requestedPreviewKey !== null &&
    requestedPreviewKey !== handledMapPreviewRequestKey
  ) {
    setHandledMapPreviewRequestKey(requestedPreviewKey);
    if (group.mode === "single" && requestedOptionId !== draftOptionId) {
      setDraftOptionId(requestedOptionId);
    }
  }

  useEffect(() => {
    if (!expanded || sessionId === null) {
      onMapOverrideChange(null);
      return;
    }
    onMapOverrideChange({
      group: numberedGroup,
      sessionId,
      ...(group.mode === "single" && draftOptionId !== undefined
        ? { activeOptionId: draftOptionId }
        : {}),
    });
  }, [
    draftOptionId,
    expanded,
    group.mode,
    numberedGroup,
    onMapOverrideChange,
    sessionId,
  ]);

  useEffect(
    () => () => {
      onMapOverrideChange(null);
    },
    [onMapOverrideChange],
  );

  useEffect(() => {
    if (
      !hasValidPreviewRequest ||
      requestedPreviewKey !== handledMapPreviewRequestKey ||
      requestedPreviewKey === lastFocusedMapPreviewRequestKeyRef.current
    ) {
      return;
    }
    lastFocusedMapPreviewRequestKeyRef.current = requestedPreviewKey;
    const optionControl = optionRefs.current.get(requestedOptionId);
    optionControl?.scrollIntoView?.({ block: "nearest" });
    optionControl?.focus();
  }, [
    handledMapPreviewRequestKey,
    hasValidPreviewRequest,
    requestedOptionId,
    requestedPreviewKey,
  ]);

  const restoreTriggerFocus = (): void => {
    queueMicrotask(() => triggerRef.current?.focus());
  };

  const closeComparison = (): void => {
    setDraftOptionId(initialDraftId(group, committedOptionId));
    setSessionId(null);
    setExpanded(false);
    restoreTriggerFocus();
  };

  const openComparison = (): void => {
    setDraftOptionId(initialDraftId(group, committedOptionId));
    setSessionId(nextCandidateSessionId());
    setExpanded(true);
  };

  const confirmDraft = (): void => {
    if (group.mode !== "single" || draftOptionId === undefined) {
      return;
    }
    const option = group.options.find(({ id }) => id === draftOptionId);
    if (option === undefined) {
      return;
    }
    onCommit(group.id, option.id);
    setAnnouncement(`已選擇 ${option.title}`);
    setSessionId(null);
    setExpanded(false);
    restoreTriggerFocus();
  };

  const triggerLabel =
    group.mode === "browse"
      ? `${expanded ? "收合" : "查看"} ${label} 候選`
      : expanded
        ? `收合 ${label}`
        : committedOption === undefined
          ? `比較 ${label}`
          : `重新比較 ${label}`;

  return (
    <section
      className="candidate-decision"
      data-candidate-mode={group.mode}
      data-expanded={expanded ? "true" : "false"}
    >
      <div className="candidate-decision__summary">
        <div>
          <strong>{label}</strong>
          {group.mode === "single" && committedOption !== undefined ? (
            <p className="candidate-decision__committed">
              {expanded ? "目前已選" : "已選"} · {committedOption.title}
            </p>
          ) : null}
        </div>
        <button
          ref={triggerRef}
          type="button"
          className="candidate-decision__trigger"
          aria-label={triggerLabel}
          aria-expanded={expanded}
          data-touch-target="44"
          onClick={expanded ? closeComparison : openComparison}
        >
          {triggerLabel}
        </button>
      </div>

      {group.mode === "single" ? (
        <fieldset className="candidate-decision__options" hidden={!expanded}>
          <legend>{label}</legend>
          {group.options.map((option, index) => {
            const optionLabel = candidateOptionLabel(sequenceNumber, index, option);
            return (
              <label key={`candidate:${option.id}`} className="candidate-decision__option">
                <input
                  ref={(element) => {
                    if (element === null) {
                      optionRefs.current.delete(option.id);
                    } else {
                      optionRefs.current.set(option.id, element);
                    }
                  }}
                  type="radio"
                  name={radioName}
                  value={option.id}
                  checked={draftOptionId === option.id}
                  onChange={() => {
                    setDraftOptionId(option.id);
                    if (hasCoordinates(option)) {
                      onLocateOption(option.id);
                    }
                  }}
                />
                <span>{optionLabel}</span>
                {hasCoordinates(option) ? null : (
                  <small className="candidate-decision__location-state">尚未定位</small>
                )}
              </label>
            );
          })}
          <div className="candidate-decision__actions">
            <button
              type="button"
              data-touch-target="44"
              aria-label="取消候選比較"
              onClick={closeComparison}
            >
              取消
            </button>
            <button
              type="button"
              data-touch-target="44"
              disabled={draftOptionId === undefined}
              aria-label={
                draftOptionId === undefined
                  ? "確認候選選擇"
                  : `確認選擇 ${group.options.find(({ id }) => id === draftOptionId)?.title ?? ""}`
              }
              onClick={confirmDraft}
            >
              確認
            </button>
          </div>
        </fieldset>
      ) : null}

      {group.mode === "browse" ? (
        <ul
          className="candidate-decision__browse-list"
          aria-label={label}
          hidden={!expanded}
        >
          {group.options.map((option, index) => {
            const optionLabel = candidateOptionLabel(sequenceNumber, index, option);
            return (
              <li key={`browse-candidate:${option.id}`}>
                {hasCoordinates(option) ? (
                  <button
                    ref={(element) => {
                      if (element === null) {
                        optionRefs.current.delete(option.id);
                      } else {
                        optionRefs.current.set(option.id, element);
                      }
                    }}
                    type="button"
                    data-touch-target="44"
                    aria-label={`定位 ${optionLabel}`}
                    onClick={() => onLocateOption(option.id)}
                  >
                    {optionLabel}
                  </button>
                ) : (
                  <span>{optionLabel} · 尚未定位</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      <span
        className="candidate-decision__status"
        role="status"
        aria-label="候選選擇狀態"
        aria-live="polite"
      >
        {announcement}
      </span>
    </section>
  );
}
